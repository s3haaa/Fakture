/* Multi-company profiles: local, isolated workspaces on the same PC. */
const PROFILE_META_KEY="fs7_profiles";
const ACTIVE_PROFILE_KEY="fs7_active_profile";
const PROFILE_PREFIX="fs7_profile_";
const LEGACY_DATA_KEYS=["company","settings","clients","invoices","draft","theme","style","offers"];
const PROFILE_DATA_KEYS=[...LEGACY_DATA_KEYS,"fs7_catalog","fs7_catalog_categories","fs7_invoice_appearance","fs7_dashboard_range","fs7_sidebar_collapsed","fs7_proformas","v12_inbox","v12_expenses","v12_projects","v12_tasks","v12_documents","v12_leads","v12_recurring"];

function profileMeta(){
  try{return JSON.parse(localStorage.getItem(PROFILE_META_KEY)||"[]")}catch{return []}
}
function saveProfileMeta(v){localStorage.setItem(PROFILE_META_KEY,JSON.stringify(v))}
function activeProfileId(){return localStorage.getItem(ACTIVE_PROFILE_KEY)||"default"}
function setActiveProfileId(id){localStorage.setItem(ACTIVE_PROFILE_KEY,id)}
function profileStorageKey(k){return `${PROFILE_PREFIX}${activeProfileId()}_${k}`}
function profileDataKeyFromFs(k){
  const match=Object.entries(FS_KEYS||{}).find(([,v])=>v===k);
  return match?match[1]:k;
}
function profileEnsure(){
  // Bring older single-company data into the first local profile.
  let profiles=profileMeta();
  if(!profiles.length){
    const id="default";
    profiles=[{id,name:"Moja firma",createdAt:Date.now()}];
    saveProfileMeta(profiles);
    setActiveProfileId(id);
    LEGACY_DATA_KEYS.forEach(k=>{
      const old=`fs7_${k}`;
      const dest=`${PROFILE_PREFIX}${id}_${k}`;
      if(localStorage.getItem(old)!==null && localStorage.getItem(dest)===null) localStorage.setItem(dest,localStorage.getItem(old));
      const old6=`fs6_${k}`; if(localStorage.getItem(old6)!==null && localStorage.getItem(dest)===null) localStorage.setItem(dest,localStorage.getItem(old6));
    });
  }
  if(!profiles.some(p=>p.id===activeProfileId())) setActiveProfileId(profiles[0].id);
}

profileEnsure();
const _fsGet=fsGet;
const _fsSet=fsSet;
window.fsGet=function(k,f=null){
  return _fsGet(profileStorageKey(profileDataKeyFromFs(k)),f);
};
window.fsSet=function(k,v){
  return _fsSet(profileStorageKey(profileDataKeyFromFs(k)),v);
};

function currentProfile(){return profileMeta().find(p=>p.id===activeProfileId())||profileMeta()[0]}
function isDemoProfile(profileOrId){const profile=typeof profileOrId==="string"?profileMeta().find(p=>p.id===profileOrId):profileOrId;return Boolean(profile&&(profile.id==="demo"||profile.demo===true))}
function clearProfileWorkspace(id){
  const prefix=`${PROFILE_PREFIX}${id}_`;
  Object.keys(localStorage).filter(key=>key.startsWith(prefix)).forEach(key=>localStorage.removeItem(key));
}
function profileName(){return currentProfile()?.name||getCompany().name||"Moja firma"}
function updateProfileMetaFromCompany(){
  const c=getCompany(), list=profileMeta(), i=list.findIndex(p=>p.id===activeProfileId());
  if(i>=0){list[i].name=c.name||list[i].name||"Moja firma";list[i].logo=c.logo||"";saveProfileMeta(list)}
}
function renderProfileMenu(){
  const root=$("profileRoot"); if(!root)return;
  const list=profileMeta(), cur=activeProfileId();
  root.innerHTML=`<div class="profile-popover-backdrop" id="profileBackdrop"><div class="profile-popover">
    <div class="profile-popover-head"><div><span class="profile-popover-kicker">RADNI PROSTOR</span><strong>Izaberi profil</strong></div><button class="icon-close" onclick="closeProfileMenu()">×</button></div>
    <div class="profile-list">${list.map(p=>`<button class="profile-option ${p.id===cur?'active':''}" onclick="switchProfile('${esc(p.id)}')"><span class="profile-option-avatar">${esc(initials(p.name))}</span><span class="profile-option-copy"><strong>${esc(p.name)}</strong><small>${p.demo?'Demo profil · unaprijed popunjen':(p.id===cur?'Trenutno aktivna firma':'Lokalni profil')}</small></span>${p.id===cur?'<span class="profile-check">✓</span>':''}</button>`).join("")}</div>
    <div class="profile-popover-foot"><button class="profile-create" onclick="createProfile()"><span>＋</span><span><strong>Nova firma / profil</strong><small>Kreiraj odvojeni prostor na ovom računaru</small></span></button></div>
  </div></div>`;
  $("profileBackdrop").onclick=e=>{if(e.target.id==="profileBackdrop")closeProfileMenu()};
}
function openProfileMenu(){renderProfileMenu()}
function closeProfileMenu(){const r=$("profileRoot");if(r)r.innerHTML=""}
function createProfile(){
  closeProfileMenu();
  openModal("Nova firma / profil",`<p class="profile-modal-copy">Svaka firma dobija potpuno odvojene klijente, fakture, ponude, postavke i katalog. Podaci ostaju lokalno na ovom računaru.</p><div class="field"><label>Naziv firme</label><input id="newProfileName" placeholder="Moja firma"></div>`,`<div class="modal-actions"><button class="btn light" onclick="closeModal()">Odustani</button><button class="btn accent" onclick="confirmCreateProfile()">Kreiraj profil</button></div>`);
  setTimeout(()=>$("newProfileName")?.focus(),30);
}
function confirmCreateProfile(){
  const entered=$("newProfileName")?.value.trim()||"Moja firma", list=profileMeta(); let name=entered,n=2;while(list.some(p=>p.name.toLocaleLowerCase("bs-BA")===name.toLocaleLowerCase("bs-BA")))name=`${entered} ${n++}`;
  const id="p_"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  list.push({id,name,createdAt:Date.now(),logo:""}); saveProfileMeta(list); setActiveProfileId(id);
  closeModal();
  // Initialize this workspace with empty defaults, then take the user to company settings.
  fsSet(FS_KEYS.company,{name,address:"",city:"",country:"Bosna i Hercegovina",id:"",vat:"",email:"",phone:"",web:"",logo:""});
  fsSet(FS_KEYS.settings,{...FS_DEFAULT_SETTINGS}); fsSet(FS_KEYS.clients,[]); fsSet(FS_KEYS.invoices,[]); fsSet(FS_KEYS.offers,[]); fsSet(FS_KEYS.draft,null); fsSet(FS_KEYS.style,{accent:"#f4c400"});
  toast("Novi profil je kreiran."); updateCompanyChrome(); navigate("settings");
}
function switchProfile(id){
  if(id===activeProfileId()){closeProfileMenu();return}
  const p=profileMeta().find(x=>x.id===id); if(!p)return;
  setActiveProfileId(id); closeProfileMenu(); updateCompanyChrome();
  applyAppearance?.(); initTheme?.(); refreshCurrentView(); toast(`Aktivna firma: ${p.name}`);
}
function deleteProfile(id){
  const list=profileMeta(); if(list.length<=1){toast("Mora postojati najmanje jedan profil.");return}
  const p=list.find(x=>x.id===id);if(!p)return;
  if(isDemoProfile(p)){toast("Demo profil se ne može obrisati. Možete ga resetovati u Postavkama.");return}
  confirmAction(`Obrisati profil “${p.name}” i sve njegove lokalne podatke?`,()=>{
    clearProfileWorkspace(id);
    const next=list.filter(x=>x.id!==id);saveProfileMeta(next);
    if(activeProfileId()===id)setActiveProfileId(next[0].id);
    closeProfileMenu();updateCompanyChrome();refreshCurrentView();toast("Profil je obrisan.");
  });
}
function demoDate(offset){return addDays(today(),offset)}
function seedDemoProfile(){
  let list=profileMeta();
  if(!list.some(p=>p.id==="demo")){list.push({id:"demo",name:"Faktura d.o.o.",createdAt:Date.now(),logo:"",demo:true});saveProfileMeta(list)}else{const demo=list.find(p=>p.id==="demo");if(demo&&demo.name!=="Faktura d.o.o."){demo.name="Faktura d.o.o.";saveProfileMeta(list)}}
  const current=activeProfileId();setActiveProfileId("demo");
  const existing=fsGet(FS_KEYS.invoices,null);
  if(!existing){
    const clients=[
      {id:"4201987650001",name:"Alto Creative d.o.o.",address:"Maršala Tita 18",city:"Sarajevo",country:"Bosna i Hercegovina",vat:"201987650001",email:"office@altocreative.example",phone:"033 555 210"},
      {id:"4221098760002",name:"Verde Market d.o.o.",address:"Kralja Tvrtka 7",city:"Mostar",country:"Bosna i Hercegovina",vat:"221098760002",email:"finansije@verdemarket.example",phone:"036 441 120"},
      {id:"4201765430003",name:"Nexa Systems d.o.o.",address:"Zmaja od Bosne 44",city:"Sarajevo",country:"Bosna i Hercegovina",vat:"201765430003",email:"hello@nexasystems.example",phone:"033 700 340"},
      {id:"4212345670004",name:"Studio Forma",address:"Titova 31",city:"Zenica",country:"Bosna i Hercegovina",vat:"212345670004",email:"kontakt@studioforma.example",phone:"032 222 918"},
      {id:"4202233440005",name:"Adria Home Group d.o.o.",address:"Bulevar Meše Selimovića 12",city:"Sarajevo",country:"Bosna i Hercegovina",vat:"202233440005",email:"office@adriahome.example",phone:"033 612 880"}
    ];
    const base=(number,daysAgo,dueOffset,status,currency,client,desc,qty,price,paid=0)=>{const issue=demoDate(-daysAgo),due=demoDate(dueOffset);const items=[{description:desc,qty,price,discount:0,vat:17}];const t=invoiceTotals(items,"percent",0);return{id:`demo_${number}`,number,issueDate:issue,dueDate:due,status,currency,paymentMethod:"Bankovni transfer",clientId:client.id,clientName:client.name,clientAddress:client.address,clientCity:client.city,clientCountry:client.country,clientEmail:client.email,clientIdNo:client.id,clientVat:client.vat,globalDiscountType:"percent",globalDiscount:0,items,note:"Hvala na povjerenju. Rok plaćanja prema uslovima na fakturi.",total:t.total,paidAmount:paid,payments:paid?[{amount:paid,date:demoDate(-2),method:"Bankovni transfer",note:"Evidentirana uplata"}]:[],createdAt:Date.now()-daysAgo*86400000,updatedAt:Date.now()-daysAgo*86400000}};
    const invoices=[
      base("001/2026",45,-15,"paid","BAM",clients[0],"Brand identity paket",1,1250,1462.5),
      base("002/2026",32,-2,"sent","BAM",clients[1],"Mjesečni social media paket",1,980,0),
      base("003/2026",26,4,"partial","BAM",clients[2],"Web dizajn i razvoj",1,1800,1053),
      base("004/2026",19,8,"sent","EUR",clients[3],"Visual identity konsultacije",1,620,0),
      base("005/2026",12,18,"draft","BAM",clients[4],"Pakovanje i dizajn ambalaže",1,740,0),
      base("006/2026",60,-25,"cancelled","BAM",clients[0],"Promotivna kampanja",1,540,0),
      base("007/2026",72,-40,"sent","BAM",clients[2],"Website maintenance",3,260,0),
      base("008/2026",8,22,"paid","BAM",clients[1],"Promo materijali",2,315,737.1)
    ];
    saveCompany({name:"Faktura d.o.o.",address:"Skenderija 14",city:"Sarajevo",country:"Bosna i Hercegovina",id:"420198700009",vat:"201987000009",email:"office@faktura.example",phone:"033 610 440",web:"faktura.example",logo:""});
    saveSettings({...FS_DEFAULT_SETTINGS,prefix:"",start:9,format:"slash-year",dueDays:15,defaultVat:17,currency:"BAM",paymentMethod:"Bankovni transfer",bank:"UniCredit Bank · BA39 3383 2000 0000 1234",paymentNote:"Hvala na povjerenju. Molimo da uplatu izvršite u roku navedenom na fakturi."});
    saveClients(clients);saveInvoices(invoices);saveOffers([
      {id:"demo_offer_1",number:"P-001/2026",issueDate:demoDate(-5),validUntil:demoDate(10),status:"accepted",currency:"BAM",clientName:clients[2].name,clientAddress:clients[2].address,clientCity:clients[2].city,clientCountry:clients[2].country,clientEmail:clients[2].email,items:[{description:"Redizajn web stranice",qty:1,price:2400,discount:0,vat:17}],note:"Ponuda važi do navedenog datuma.",total:2808,createdAt:Date.now()-5*86400000},
      {id:"demo_offer_2",number:"P-002/2026",issueDate:demoDate(-11),validUntil:demoDate(4),status:"sent",currency:"BAM",clientName:clients[4].name,clientAddress:clients[4].address,clientCity:clients[4].city,clientCountry:clients[4].country,clientEmail:clients[4].email,items:[{description:"Dizajn ambalaže",qty:3,price:450,discount:0,vat:17}],note:"Ponuda važi do navedenog datuma.",total:1580.85,createdAt:Date.now()-11*86400000},
      {id:"demo_offer_3",number:"P-003/2026",issueDate:demoDate(-22),validUntil:demoDate(-7),status:"rejected",currency:"EUR",clientName:clients[0].name,clientAddress:clients[0].address,clientCity:clients[0].city,clientCountry:clients[0].country,clientEmail:clients[0].email,items:[{description:"Kreativna kampanja",qty:1,price:900,discount:0,vat:17}],note:"Hvala na interesovanju.",total:1053,createdAt:Date.now()-22*86400000},
      {id:"demo_offer_4",number:"P-004/2026",issueDate:demoDate(-2),validUntil:demoDate(13),status:"new",currency:"BAM",clientName:clients[3].name,clientAddress:clients[3].address,clientCity:clients[3].city,clientCountry:clients[3].country,clientEmail:clients[3].email,items:[{description:"Dizajn kataloga",qty:1,price:890,discount:0,vat:17}],note:"Ponuda važi do navedenog datuma.",total:1041.3,createdAt:Date.now()-2*86400000}
    ]);
    fsSet("fs7_catalog",[{name:"Brand Identity",description:"Kompletna vizuelna identifikacija",type:"Usluga",price:1250,vat:17,currency:"BAM"},{name:"Social Media Paket",description:"Mjesečni paket dizajna za društvene mreže",type:"Usluga",price:980,vat:17,currency:"BAM"},{name:"Web Design",description:"UI/UX i dizajn web stranice",type:"Usluga",price:1800,vat:17,currency:"BAM"},{name:"Ambalaža",description:"Dizajn ambalaže po proizvodu",type:"Usluga",price:450,vat:17,currency:"BAM"},{name:"Promo materijali",description:"Brošure, letci i promotivni materijali",type:"Usluga",price:315,vat:17,currency:"BAM"}]);
    fsSet("v12_recurring",[{client:clients[1].name,description:"Mjesečni social media paket",amount:980,currency:"BAM",period:"Mjesečno",next:demoDate(9),active:true},{client:clients[2].name,description:"Web maintenance",amount:260,currency:"BAM",period:"Mjesečno",next:demoDate(18),active:true}]);
    fsSet(FS_KEYS.style,{accent:"#2468ee"});fsSet(FS_KEYS.draft,null);
  }
  setActiveProfileId(current);
}
function resetDemoProfile(id="demo"){
  const list=profileMeta(),index=list.findIndex(profile=>profile.id===id);
  if(index<0||!isDemoProfile(list[index]))return false;
  const previousActive=activeProfileId();
  clearProfileWorkspace(id);
  list[index]={...list[index],id:"demo",name:"Faktura d.o.o.",logo:"",demo:true};
  saveProfileMeta(list);
  setActiveProfileId(id);
  seedDemoProfile();
  setActiveProfileId(previousActive===id?id:previousActive);
  return true;
}
function initProfiles(){
  profileEnsure();
  seedDemoProfile();
  [$("sidebarProfileMenu")].forEach(el=>{if(el)el.onclick=openProfileMenu});
}
