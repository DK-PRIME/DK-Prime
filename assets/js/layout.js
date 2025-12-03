document.addEventListener("DOMContentLoaded", async () => {
  const headerSlot = document.getElementById("header-slot");

  if (!headerSlot) return;

  try {
    const res = await fetch("assets/components/header.html");
    const html = await res.text();
    headerSlot.innerHTML = html;

    // Бургер після підвантаження
    const burger = document.getElementById("burger");
    const nav = document.getElementById("nav");

    if (burger && nav) {
      burger.addEventListener("click", () => {
        nav.classList.toggle("nav--open");
        burger.classList.toggle("burger--open");
      });
    }
  } catch (err) {
    console.error("Не вдалося завантажити header:", err);
  }
});
