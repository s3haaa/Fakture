function applyTheme(mode){
  const dark=mode==="dark";
  document.body.classList.toggle("dark",dark);
  document.documentElement.style.colorScheme=dark?"dark":"light";
  const b=$("themeToggle");
  if(b){
    b.textContent=dark?"☀":"◐";
    b.title=dark?"Svijetli način":"Tamni način";
    b.setAttribute("aria-label",dark?"Prebaci na svijetli način":"Prebaci na tamni način");
  }
}
function initTheme(){applyTheme(fsGet(FS_KEYS.theme,"light")==="dark"?"dark":"light")}
$("themeToggle").onclick=()=>{
  const mode=document.body.classList.contains("dark")?"light":"dark";
  fsSet(FS_KEYS.theme,mode);
  applyTheme(mode);
};
