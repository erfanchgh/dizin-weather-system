const assets = window.DIZIN_ASSETS || {};
const data = window.DIZIN_WEATHER;
const grid = document.getElementById("forecastGrid");
const note = document.getElementById("note");
const picker = document.getElementById("backgroundPicker");
const bg = document.getElementById("storyBg");
const brandLogo = document.querySelector(".brand-logo");

const params = new URLSearchParams(location.search);
if (params.get("render") === "1") document.body.classList.add("render-mode");

function applyAssets(){
  if (assets.background) bg.style.backgroundImage = `url("${assets.background}")`;
  if (assets.logo && brandLogo) brandLogo.src = assets.logo;
}

function formatUpdated(){
  const d = new Date(data.updatedAt);
  const day = new Intl.DateTimeFormat("fa-IR",{timeZone:"Asia/Tehran",weekday:"long"}).format(d);
  const date = new Intl.DateTimeFormat("fa-IR-u-ca-persian",{timeZone:"Asia/Tehran",day:"numeric",month:"long",year:"numeric"}).format(d);
  const time = new Intl.DateTimeFormat("fa-IR",{timeZone:"Asia/Tehran",hour:"2-digit",minute:"2-digit",hour12:false}).format(d);
  document.getElementById("updateDay").textContent = day;
  document.getElementById("updateDate").textContent = date;
  document.getElementById("updateTime").textContent = `آخرین به‌روزرسانی ${time}`;
}

function render(){
  const first = data.days?.[0];
  if(first){
    document.getElementById("heroIcon").textContent = first.icon;
    document.getElementById("heroCondition").textContent = first.condition || "—";
    document.getElementById("heroTemp").textContent = `${first.temp}°C`;
    document.getElementById("heroFeels").textContent = `${first.feels}°`;
    document.getElementById("heroWind").textContent = first.wind;
    document.getElementById("heroSnow").textContent = first.snow;
    document.getElementById("heroHumidity").textContent = first.humidity ?? "—";
  }

  grid.innerHTML = data.days.map((d, index)=>`
    <article class="day-card" data-day-index="${index + 1}">
      <div class="day">${d.day}</div>
      <div class="date">${d.date}</div>
      <div class="weather-icon" aria-hidden="true">${d.icon}</div>
      <div class="day-condition">${d.condition || ""}</div>
      <div class="day-temp">${d.temp}°C</div>
      <div class="day-feels">دمای حسی: <bdi>${d.feels}°</bdi></div>
      <div class="day-metrics">
        <div class="metric-row"><span>باد</span><strong><bdi>${d.wind} km/h</bdi></strong></div>
        <div class="metric-row"><span>برف</span><strong><bdi>${d.snow} cm</bdi></strong></div>
        <div class="metric-row"><span>رطوبت</span><strong><bdi>${d.humidity ?? "—"}%</bdi></strong></div>
      </div>
      <div class="card-height">ارتفاع معیار: ۳۵۹۹ متر</div>
    </article>
  `).join("");

  note.textContent = data.note;
  formatUpdated();
}

picker?.addEventListener("change",(event)=>{
  const file = event.target.files?.[0];
  if(!file) return;
  bg.style.backgroundImage = `url("${URL.createObjectURL(file)}")`;
});

applyAssets();
render();
