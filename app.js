const assets = window.DIZIN_ASSETS || null;
const data = window.DIZIN_WEATHER;
const grid = document.getElementById("forecastGrid");
const note = document.getElementById("note");
const picker = document.getElementById("backgroundPicker");
const reset = document.getElementById("resetBackground");
const bg = document.getElementById("storyBg");
const brandLogo = document.querySelector(".brand-logo");

if (assets?.background) bg.style.backgroundImage = `url("${assets.background}")`;
if (assets?.logo && brandLogo) {
  brandLogo.src = assets.logo;
  brandLogo.style.display = "block";
  const fallback = brandLogo.nextElementSibling;
  if (fallback) fallback.style.display = "none";
}

function render(){
  grid.innerHTML = data.days.map((d)=>`
    <article class="day-card">
      <div class="day">${d.day}</div>
      <div class="date">${d.date}</div>
      <div class="weather-icon" aria-hidden="true">${d.icon}</div>
      <div class="temp summit"><span>${d.temp}</span><span>°</span></div>
      <div class="feels">دمای حسی: <bdi>${d.feels}°</bdi></div>
      <div class="metrics">
        <div class="metric"><span>باد</span><strong><bdi>${d.wind} km/h</bdi></strong></div>
        <div class="metric"><span>برف</span><strong><bdi>${d.snow} cm</bdi></strong></div>
        <div class="metric"><span>ارتفاع معیار</span><strong class="summit"><bdi>${data.summitElevation} m</bdi></strong></div>
      </div>
    </article>
  `).join("");
  note.textContent = data.note;
}

picker.addEventListener("change",(event)=>{
  const file = event.target.files?.[0];
  if(!file) return;
  const url = URL.createObjectURL(file);
  bg.style.backgroundImage = `url("${url}")`;
});

reset.addEventListener("click",()=>{
  bg.style.backgroundImage = assets?.background ? `url("${assets.background}")` : 'url("assets/background.svg")';
  picker.value = "";
});

render();
