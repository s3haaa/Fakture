/* Shared document numbering and labels. User-entered content is never translated. */
const DOCUMENT_LABELS={
  bs:{invoice:'FAKTURA',offer:'PONUDA',proforma:'PREDRAČUN',issued:'Izdano',due:'Rok plaćanja',valid:'Važi do',issuer:'IZDAVALAC',client:'KLIJENT',items:'Naziv i opis stavke',quantity:'Količina',price:'Cijena',vat:'PDV',subtotal:'Međuzbir',discount:'Popust',total:'UKUPNO',payment:'NAČIN PLAĆANJA',company:'PODACI FIRME',continuation:'Nastavak stavki',nextPage:'Nastavak na sljedećoj stranici',page:'Stranica'},
  en:{invoice:'INVOICE',offer:'OFFER',proforma:'PROFORMA INVOICE',issued:'Issued',due:'Due date',valid:'Valid until',issuer:'ISSUER',client:'CLIENT',items:'Item name and description',quantity:'Quantity',price:'Price',vat:'VAT',subtotal:'Subtotal',discount:'Discount',total:'TOTAL',payment:'PAYMENT METHOD',company:'COMPANY DETAILS',continuation:'Items continued',nextPage:'Continued on next page',page:'Page'}
};
function normalizeDocumentLanguage(value){return value==='en'?'en':'bs'}
function documentLabels(language){return DOCUMENT_LABELS[normalizeDocumentLanguage(language)]}
function documentNumbering(kind){
  const settings=getSettings();
  if(kind==='invoice')return{prefix:settings.prefix||'',start:+settings.start||1,format:settings.format||'slash-year'};
  if(kind==='offer')return{prefix:'',start:1,format:'year-slash',...(settings.offerNumbering||{})};
  return{prefix:'PF-',start:1,format:'prefix-year',...(settings.proformaNumbering||{})};
}
function formatDocumentNumber(kind,sequence,year=new Date().getFullYear()){
  const config=documentNumbering(kind),serial=String(sequence).padStart(3,'0'),prefix=config.prefix||'';
  if(config.format==='year-slash')return`${prefix}${year}/${serial}`;
  return`${prefix}${serial}/${year}`;
}
function nextConfiguredDocumentNumber(kind,rows=[]){
  const config=documentNumbering(kind),year=new Date().getFullYear(),used=new Set(rows.map(row=>String(row.number||'').trim()));
  let sequence=Math.max(1,+config.start||1);
  rows.forEach(row=>{
    const number=String(row.number||''),numbers=number.match(/\d+/g)||[];
    if(!numbers.length)return;
    const rowYear=numbers.find(value=>+value>=2000&&+value<=2200),serials=numbers.filter(value=>value!==rowYear),serial=+(serials.at(-1)||numbers.at(-1));
    if(!Number.isFinite(serial))return;
    if(getSettings().numberingYearReset===false||!rowYear||+rowYear===year)sequence=Math.max(sequence,serial+1);
  });
  while(used.has(formatDocumentNumber(kind,sequence,year)))sequence++;
  return formatDocumentNumber(kind,sequence,year);
}
