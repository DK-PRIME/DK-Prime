/* =======================================================================
   STOLAR CARP AUTH SDK v3.0
   Staff Engineer / Architect Level
   Clean Architecture + DDD + Event-Driven + Plugin System
   ======================================================================= */

/* =======================================================================
   DOMAIN LAYER — Core business logic (no external dependencies)
   ======================================================================= */

// Domain Events
class DomainEvent {
  constructor(type, payload, metadata = {}) {
    this.id = crypto.randomUUID();
    this.type = type;
    this.payload = payload;
    this.metadata = {
      ...metadata,
      timestamp: Date.now(),
      version: "3.0.0"
    };
  }
}

class UserRegisteredEvent extends DomainEvent {
  constructor(userId, role, teamId) {
    super("user.registered", { userId, role, teamId });
  }
}

class TeamCreatedEvent extends DomainEvent {
  constructor(teamId, name, ownerId, joinCode) {
    super("team.created", { teamId, name, ownerId, joinCode });
  }
}

// Domain Entities
class User {
  constructor(id, email, role, teamId = null) {
    this.id = id;
    this.email = email;
    this.role = role;
    this.teamId = teamId;
    this.createdAt = new Date();
  }

  static create(data) {
    if (!data.email || !data.role) {
      throw new ValidationError("user", "Invalid user data");
    }
    return new User(data.id, data.email, data.role, data.teamId);
  }
}

class Team {
  constructor(id, name, ownerId, joinCode) {
    this.id = id;
    this.name = name;
    this.ownerId = ownerId;
    this.joinCode = joinCode;
    this.memberCount = 1;
    this.createdAt = new Date();
  }

  static create(data) {
    if (!data.name || !data.ownerId) {
      throw new ValidationError("team", "Invalid team data");
    }
    return new Team(data.id, data.name, data.ownerId, data.joinCode);
  }

  addMember() {
    this.memberCount++;
  }
}

// Domain Repository Interface
class IUserRepository {
  async create(user) { throw new Error("Not implemented"); }
  async findById(id) { throw new Error("Not implemented"); }
  async updateTeam(id, teamId, role) { throw new Error("Not implemented"); }
}

class ITeamRepository {
  async create(team) { throw new Error("Not implemented"); }
  async findByJoinCode(code) { throw new Error("Not implemented"); }
  async exists(name) { throw new Error("Not implemented"); }
  async addMember(teamId, userId) { throw new Error("Not implemented"); }
}

// Domain Services
class UserRegistrationService {
  constructor(userRepo, teamRepo, eventBus) {
    this.userRepo = userRepo;
    this.teamRepo = teamRepo;
    this.eventBus = eventBus;
  }

  async registerAsCaptain(data) {
    const { userId, email, teamName } = data;
    
    // Business rule: team name must be unique
    const exists = await this.teamRepo.exists(teamName);
    if (exists) {
      throw new TeamError("TEAM_NAME_TAKEN", "Team name already exists");
    }

    // Create team
    const team = Team.create({
      id: crypto.randomUUID(),
      name: teamName,
      ownerId: userId,
      joinCode: this._generateJoinCode()
    });

    await this.teamRepo.create(team);

    // Create user
    const user = User.create({
      id: userId,
      email: email,
      role: "captain",
      teamId: team.id
    });

    await this.userRepo.create(user);

    // Publish events
    this.eventBus.publish(new TeamCreatedEvent(team.id, team.name, userId, team.joinCode));
    this.eventBus.publish(new UserRegisteredEvent(userId, "captain", team.id));

    return { user, team };
  }

  async registerAsMember(data) {
    const { userId, email, joinCode } = data;

    // Find team
    const team = await this.teamRepo.findByJoinCode(joinCode);
    if (!team) {
      throw new TeamError("TEAM_NOT_FOUND", "Invalid join code");
    }

    // Create user
    const user = User.create({
      id: userId,
      email: email,
      role: "member",
      teamId: team.id
    });

    await this.userRepo.create(user);

    // Add member to team (atomic)
    await Promise.all([
      this.teamRepo.addMember(team.id, userId),
      this.userRepo.updateTeam(userId, team.id, "member")
    ]);

    // Publish events
    this.eventBus.publish(new UserRegisteredEvent(userId, "member", team.id));

    return { user, team };
  }

  _generateJoinCode() {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 6 }, () => 
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  }
}

/* =======================================================================
   APPLICATION LAYER — Use cases
   ======================================================================= */

class RegisterUserUseCase {
  constructor(registrationService, authService, eventBus) {
    this.registrationService = registrationService;
    this.authService = authService;
    this.eventBus = eventBus;
  }

  async execute(command) {
    const { email, password, role, teamName, joinCode, ...profile } = command;

    // Validate input
    this._validate(command);

    // Create Firebase user
    const firebaseUser = await this.authService.createUser(email, password);

    try {
      let result;
      
      if (role === "captain") {
        result = await this.registrationService.registerAsCaptain({
          userId: firebaseUser.uid,
          email,
          teamName
        });
      } else if (role === "member") {
        result = await this.registrationService.registerAsMember({
          userId: firebaseUser.uid,
          email,
          joinCode
        });
      } else {
        throw new ValidationError("role", "Invalid role");
      }

      // Create user profile
      await this.authService.createUserProfile(firebaseUser.uid, {
        ...profile,
        role,
        teamId: result.team.id
      });

      return {
        user: result.user,
        team: result.team,
        firebaseUser
      };

    } catch (error) {
      // Rollback Firebase user on failure
      await this.authService.deleteUser(firebaseUser);
      throw error;
    }
  }

  _validate(command) {
    // Validation logic here
    if (!command.email || !command.password) {
      throw new ValidationError("input", "Email and password required");
    }
  }
}

/* =======================================================================
   INFRASTRUCTURE LAYER — Firebase implementation
   ======================================================================= */

class FirebaseEventBus {
  constructor() {
    this.handlers = new Map();
  }

  subscribe(eventType, handler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType).push(handler);
  }

  publish(event) {
    const handlers = this.handlers.get(event.type) || [];
    handlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error("Event handler error:", error);
      }
    });
  }
}

class FirebaseUserRepository extends IUserRepository {
  constructor(db, getTimestamp) {
    super();
    this.db = db;
    this.getTimestamp = getTimestamp;
  }

  async create(user) {
    await this.db.collection("users").doc(user.id).set({
      email: user.email,
      role: user.role,
      teamId: user.teamId,
      createdAt: this.getTimestamp(),
      updatedAt: this.getTimestamp()
    });
  }

  async findById(id) {
    const doc = await this.db.collection("users").doc(id).get();
    if (!doc.exists) return null;
    
    const data = doc.data();
    return User.create({
      id: doc.id,
      email: data.email,
      role: data.role,
      teamId: data.teamId
    });
  }

  async updateTeam(id, teamId, role) {
    await this.db.collection("users").doc(id).update({
      teamId,
      role,
      updatedAt: this.getTimestamp()
    });
  }
}

class FirebaseTeamRepository extends ITeamRepository {
  constructor(db, getTimestamp) {
    super();
    this.db = db;
    this.getTimestamp = getTimestamp;
  }

  async create(team) {
    const doc = await this.db.collection("teams").add({
      name: team.name,
      nameKey: team.name.toLowerCase(),
      ownerId: team.ownerId,
      joinCode: team.joinCode,
      memberCount: team.memberCount,
      createdAt: this.getTimestamp(),
      updatedAt: this.getTimestamp()
    });

    return { ...team, id: doc.id };
  }

  async findByJoinCode(code) {
    const snap = await this.db
      .collection("teams")
      .where("joinCode", "==", code)
      .limit(1)
      .get();

    if (snap.empty) return null;

    const doc = snap.docs[0];
    const data = doc.data();
    
    return Team.create({
      id: doc.id,
      name: data.name,
      ownerId: data.ownerId,
      joinCode: data.joinCode
    });
  }

  async exists(name) {
    const key = name.toLowerCase();
    const snap = await this.db
      .collection("teams")
      .where("nameKey", "==", key)
      .limit(1)
      .get();
    
    return !snap.empty;
  }

  async addMember(teamId, userId) {
    await this.db.runTransaction(async (transaction) => {
      const teamRef = this.db.collection("teams").doc(teamId);
      const teamDoc = await transaction.get(teamRef);
      
      if (!teamDoc.exists) {
        throw new TeamError("TEAM_NOT_FOUND", "Team not found");
      }

      const currentCount = teamDoc.data().memberCount || 0;
      
      transaction.update(teamRef, {
        memberCount: currentCount + 1,
        updatedAt: this.getTimestamp()
      });
    });
  }
}

class FirebaseAuthService {
  constructor(auth) {
    this.auth = auth;
  }

  async createUser(email, password) {
    const credential = await this.auth.createUserWithEmailAndPassword(email, password);
    return credential.user;
  }

  async deleteUser(user) {
    await user.delete();
  }

  async signIn(email, password) {
    const credential = await this.auth.signInWithEmailAndPassword(email, password);
    return credential.user;
  }

  async signOut() {
    await this.auth.signOut();
  }

  onAuthStateChanged(callback) {
    return this.auth.onAuthStateChanged(callback);
  }

  createUserProfile(uid, data) {
    // Implementation for creating user profile
  }
}

/* =======================================================================
   PRESENTATION LAYER — UI with modern patterns
   ======================================================================= */

class AuthPresenter {
  constructor(authService, useCases) {
    this.authService = authService;
    this.useCases = useCases;
    this.view = null;
  }

  setView(view) {
    this.view = view;
  }

  async handleLogin(email, password) {
    try {
      this.view?.showLoading();
      
      if (!SecurityService.canAttempt(email)) {
        throw new SecurityError(CONFIG.MESSAGES.ACCOUNT_LOCKED);
      }

      const user = await this.authService.signIn(email, password);
      SecurityService.recordSuccess(email);
      
      this.view?.hideLoading();
      this.view?.showSuccess("Login successful");
      
      return user;
      
    } catch (error) {
      SecurityService.recordFailure(email);
      this.view?.hideLoading();
      this.view?.showError(error.message);
      throw error;
    }
  }

  async handleRegistration(data) {
    try {
      this.view?.showLoading();
      
      const result = await this.useCases.register.execute(data);
      
      this.view?.hideLoading();
      this.view?.showSuccess("Registration successful");
      
      return result;
      
    } catch (error) {
      this.view?.hideLoading();
      this.view?.showError(error.message);
      throw error;
    }
  }
}

/* =======================================================================
   MAIN APPLICATION — Composition root
   ======================================================================= */

class StolarCarpAuthApp {
  constructor() {
    this.services = null;
    this.presenter = null;
    this.eventBus = null;
  }

  async init() {
    try {
      // Initialize infrastructure
      await FirebaseService.init();
      
      // Create event bus
      this.eventBus = new FirebaseEventBus();
      
      // Create repositories
      const userRepo = new FirebaseUserRepository(
        FirebaseService.db, 
        () => FirebaseService.getTimestamp()
      );
      
      const teamRepo = new FirebaseTeamRepository(
        FirebaseService.db,
        () => FirebaseService.getTimestamp()
      );

      // Create domain services
      const registrationService = new UserRegistrationService(
        userRepo, 
        teamRepo, 
        this.eventBus
      );

      // Create application services
      const authService = new FirebaseAuthService(FirebaseService.auth);
      
      const registerUseCase = new RegisterUserUseCase(
        registrationService,
        authService,
        this.eventBus
      );

      // Create presenter
      this.presenter = new AuthPresenter(authService, {
        register: registerUseCase
      });

      // Subscribe to events
      this._subscribeToEvents();

      // Initialize UI
      await this._initUI();

    } catch (error) {
      console.error("Failed to initialize app:", error);
      this._showFatalError(error);
    }
  }

  _subscribeToEvents() {
    this.eventBus.subscribe("user.registered", (event) => {
      console.log("User registered:", event.payload);
      // Analytics, notifications, etc.
    });

    this.eventBus.subscribe("team.created", (event) => {
      console.log("Team created:", event.payload);
      // Analytics, notifications, etc.
    });
  }

  async _initUI() {
    // Modern UI initialization with presenter pattern
    const view = new AuthView(this.presenter);
    this.presenter.setView(view);
    view.init();
  }

  _showFatalError(error) {
    document.body.innerHTML = `
      <div style="padding: 40px; text-align: center; font-family: system-ui;">
        <h2 style="color: #dc2626;">⚠️ System Error</h2>
        <p>${sanitize(error.message)}</p>
        <button onclick="location.reload()" style="
          margin-top: 20px; 
          padding: 12px 24px; 
          background: #2563eb; 
          color: white; 
          border: none; 
          border-radius: 6px;
          cursor: pointer;
        ">
          Reload Application
        </button>
      </div>
    `;
  }
}

/* =======================================================================
   VIEW LAYER — Modern UI implementation
   ======================================================================= */

class AuthView {
  constructor(presenter) {
    this.presenter = presenter;
    this.elements = {};
  }

  init() {
    this._cacheElements();
    this._bindEvents();
    this._initRealTimeValidation();
  }

  _cacheElements() {
    this.elements = {
      loginForm: document.getElementById("loginForm"),
      signupForm: document.getElementById("signupForm"),
      loginMsg: document.getElementById("loginMsg"),
      signupMsg: document.getElementById("signupMsg"),
      loginBtn: document.getElementById("loginBtn"),
      signupBtn: document.getElementById("signupBtn"),
      tabLogin: document.getElementById("tabLogin"),
      tabSignup: document.getElementById("tabSignup"),
      panelLogin: document.getElementById("panelLogin"),
      panelSignup: document.getElementById("panelSignup"),
      teamNameInput: document.getElementById("signupTeamName"),
      teamNameFeedback: document.getElementById("teamNameFeedback"),
      roleInputs: document.querySelectorAll("input[name='signupRole']"),
      captainFields: document.getElementById("captainFields"),
      memberFields: document.getElementById("memberFields"),
      loggedBox: document.getElementById("loggedBox"),
      authBox: document.getElementById("authBox"),
      loggedMsg: document.getElementById("loggedMsg")
    };
  }

  _bindEvents() {
    // Tab switching
    this.elements.tabLogin?.addEventListener("click", () => this._switchTab("login"));
    this.elements.tabSignup?.addEventListener("click", () => this._switchTab("signup"));

    // Form submissions
    this.elements.loginForm?.addEventListener("submit", (e) => this._handleLogin(e));
    this.elements.signupForm?.addEventListener("submit", (e) => this._handleSignup(e));

    // Role switching
    this.elements.roleInputs.forEach(input => {
      input.addEventListener("change", (e) => this._handleRoleChange(e.target.value));
    });
  }

  _initRealTimeValidation() {
    // Team name validation
    if (this.elements.teamNameInput && this.elements.teamNameFeedback) {
      const checkName = debounce(async (e) => {
        const name = sanitize(e.target.value);
        
        if (name.length < CONFIG.AUTH.MIN_TEAM_NAME_LENGTH) {
          this.elements.teamNameFeedback.textContent = "";
          return;
        }

        try {
          // This would need to be injected properly
          const exists = await window._app?.services?.team?.isNameTaken(name);
          this.elements.teamNameFeedback.textContent = exists ? "❌ Зайнято" : "✓ Вільно";
          this.elements.teamNameFeedback.className = exists ? "feedback-taken" : "feedback-free";
        } catch {
          this.elements.teamNameFeedback.textContent = "";
        }
      }, 400);

      this.elements.teamNameInput.addEventListener("input", checkName);
    }
  }

  _handleLogin(e) {
    e.preventDefault();
    
    const email = sanitize(document.getElementById("loginEmail")?.value);
    const password = document.getElementById("loginPassword")?.value;

    this.presenter.handleLogin(email, password)
      .then(user => {
        this._redirectAfterAuth(user);
      })
      .catch(error => {
        // Error already handled by presenter
      });
  }

  _handleSignup(e) {
    e.preventDefault();
    
    const formData = {
      email: sanitize(document.getElementById("signupEmail")?.value),
      password: document.getElementById("signupPassword")?.value,
      fullName: sanitize(document.getElementById("signupFullName")?.value),
      phone: sanitize(document.getElementById("signupPhone")?.value),
      city: sanitize(document.getElementById("signupCity")?.value),
      role: document.querySelector("input[name='signupRole']:checked")?.value,
      teamName: sanitize(document.getElementById("signupTeamName")?.value),
      joinCode: sanitize(document.getElementById("signupJoinCode")?.value)
    };

    this.presenter.handleRegistration(formData)
      .then(result => {
        this._showSuccess(result.role === "captain" 
          ? `🎉 Команда створена! Код: ${result.team.joinCode}`
          : `✅ Приєднано до команди: ${result.team.name}`
        );
        setTimeout(() => this._redirectAfterAuth(result.user), 1200);
      })
      .catch(error => {
        // Error already handled by presenter
      });
  }

  _handleRoleChange(role) {
    const isCaptain = role === "captain";
    this.elements.captainFields?.classList.toggle("hidden", !isCaptain);
    this.elements.memberFields?.classList.toggle("hidden", isCaptain);
  }

  _switchTab(tab) {
    const isLogin = tab === "login";
    
    this.elements.panelLogin?.classList.toggle("hidden", !isLogin);
    this.elements.panelSignup?.classList.toggle("hidden", isLogin);
    this.elements.tabLogin?.classList.toggle("active", isLogin);
    this.elements.tabSignup?.classList.toggle("active", !isLogin);
  }

  _handleAuthState(user) {
    if (user) {
      const isAdmin = user.uid === CONFIG.AUTH.ADMIN_UID;
      this.elements.loggedMsg.textContent = isAdmin 
        ? "Ви увійшли як адміністратор" 
        : "Ви вже увійшли у свій акаунт";
      
      this.elements.loggedBox?.classList.remove("hidden");
      this.elements.authBox?.classList.add("hidden");
    } else {
      this.elements.loggedBox?.classList.add("hidden");
      this.elements.authBox?.classList.remove("hidden");
    }
  }

  _redirectAfterAuth(user) {
    const isAdmin = user?.uid === CONFIG.AUTH.ADMIN_UID;
    location.href = isAdmin ? CONFIG.ROUTES.ADMIN : CONFIG.ROUTES.CABINET;
  }

  // View interface methods
  showLoading() {
    // Show loading state
  }

  hideLoading() {
    // Hide loading state
  }

  showSuccess(message) {
    // Show success message
  }

  showError(message) {
    // Show error message
  }
}

/* =======================================================================
   PLUGIN SYSTEM — Extensible architecture
   ======================================================================= */

class PluginManager {
  constructor() {
    this.plugins = new Map();
  }

  register(name, plugin) {
    this.plugins.set(name, plugin);
    plugin.init?.();
  }

  async executeHook(hookName, context) {
    const results = [];
    
    for (const [name, plugin] of this.plugins) {
      if (plugin.hooks?.[hookName]) {
        try {
          const result = await plugin.hooks[hookName](context);
          results.push({ name, result });
        } catch (error) {
          console.error(`Plugin ${name} hook ${hookName} failed:`, error);
        }
      }
    }
    
    return results;
  }
}

// Example plugin
const AnalyticsPlugin = {
  name: "analytics",
  
  init() {
    console.log("Analytics plugin initialized");
  },
  
  hooks: {
    "user.registered": async (event) => {
      console.log("Tracking user registration:", event.payload);
      // Send to analytics service
    },
    
    "team.created": async (event) => {
      console.log("Tracking team creation:", event.payload);
      // Send to analytics service
    }
  }
};

/* =======================================================================
   COMPOSITION ROOT — Dependency injection container
   ======================================================================= */

class DIContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
  }

  register(name, factory, options = {}) {
    this.services.set(name, { factory, options });
  }

  registerSingleton(name, factory) {
    this.register(name, factory, { singleton: true });
  }

  resolve(name) {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not registered`);
    }

    if (service.options.singleton) {
      if (!this.singletons.has(name)) {
        this.singletons.set(name, service.factory());
      }
      return this.singletons.get(name);
    }

    return service.factory();
  }
}

/* =======================================================================
   FINAL APPLICATION BOOTSTRAP
   ======================================================================= */

// Create DI container
const container = new DIContainer();

// Register services
container.registerSingleton("eventBus", () => new FirebaseEventBus());

container.registerSingleton("userRepository", () => 
  new FirebaseUserRepository(
    FirebaseService.db,
    () => FirebaseService.getTimestamp()
  )
);

container.registerSingleton("teamRepository", () =>
  new FirebaseTeamRepository(
    FirebaseService.db,
    () => FirebaseService.getTimestamp()
  )
);

container.registerSingleton("registrationService", () =>
  new UserRegistrationService(
    container.resolve("userRepository"),
    container.resolve("teamRepository"),
    container.resolve("eventBus")
  )
);

container.registerSingleton("authService", () =>
  new FirebaseAuthService(FirebaseService.auth)
);

container.registerSingleton("registerUseCase", () =>
  new RegisterUserUseCase(
    container.resolve("registrationService"),
    container.resolve("authService"),
    container.resolve("eventBus")
  )
);

container.registerSingleton("presenter", () =>
  new AuthPresenter(
    container.resolve("authService"),
    {
      register: container.resolve("registerUseCase")
    }
  )
);

// Plugin system
const pluginManager = new PluginManager();
pluginManager.register("analytics", AnalyticsPlugin);

// Main application
class StolarCarpAuth {
  constructor(container, pluginManager) {
    this.container = container;
    this.pluginManager = pluginManager;
    this.app = null;
  }

  async init() {
    try {
      await FirebaseService.init();
      
      this.app = new StolarCarpAuthApp();
      await this.app.init();
      
      console.log("🎯 STOLAR CARP Auth SDK v3.0 initialized");
      
    } catch (error) {
      console.error("❌ Failed to initialize:", error);
      this._showFatalError(error);
    }
  }

  _showFatalError(error) {
    document.body.innerHTML = `
      <div style="padding: 40px; text-align: center; font-family: system-ui;">
        <h2 style="color: #dc2626;">⚠️ System Error</h2>
        <p>${sanitize(error.message)}</p>
        <button onclick="location.reload()" style="
          margin-top: 20px; 
          padding: 12px 24px; 
          background: #2563eb; 
          color: white; 
          border: none; 
          border-radius: 6px;
          cursor: pointer;
        ">
          Reload Application
        </button>
      </div>
    `;
  }
}

/* =======================================================================
   BOOTSTRAP
   ======================================================================= */

const authSystem = new StolarCarpAuth(container, pluginManager);

document.addEventListener("DOMContentLoaded", () => {
  authSystem.init();
});

window.addEventListener("beforeunload", () => {
  // Cleanup logic here
});
