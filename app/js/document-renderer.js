/* PDF uses the actual A4 preview, not an independent drawing. */
let invoicePdfBusy=false, invoiceCanvasLoader;
// Keep the white panel above the footer, even when notes wrap to more lines.
const studioFooterObserver=new ResizeObserver(entries=>{
 for(const {target} of entries){
  const paper=target.closest('.template-studio');if(!paper)continue;
  const gap=target.getBoundingClientRect().height-parseFloat(getComputedStyle(target).paddingTop)+56;
  paper.style.setProperty('--studio-footer-space',Math.ceil(gap)+'px');
 }
});
const observedStudioFooters=new WeakSet();
new MutationObserver(()=>{
 document.querySelectorAll('.template-studio .sample-bottom').forEach(footer=>{
  if(!observedStudioFooters.has(footer)){observedStudioFooters.add(footer);studioFooterObserver.observe(footer)}
 });
}).observe(document.getElementById('viewContainer'),{childList:true,subtree:true});

invoiceHtmlForDocument=function(){
 const paper=document.querySelector('#a4Preview .sample-a4');
 if(!paper)throw new Error('Pregled fakture nije otvoren.');
 const clone=paper.cloneNode(true);
 clone.style.setProperty('--brand-doc',getBrandColor());
 const styles=[...document.querySelectorAll('link[rel="stylesheet"]')].map(link=>'<link rel="stylesheet" href="'+esc(link.href)+'">').join('');
 return '<!doctype html><html lang="bs"><head><meta charset="utf-8"><title>Faktura '+esc(invoiceState.number)+'</title>'+styles+'<style>@page{size:A4;margin:0}html,body{display:block!important;width:210mm!important;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important;background:white!important}body>.sample-a4{margin:0!important;box-shadow:none!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}tr,.sample-summary,.sample-bottom{break-inside:avoid}</style></head><body>'+clone.outerHTML+'</body></html>';
};
printCurrentInvoice=async function(){
 syncInvoiceFromForm();if(!validateInvoice())return;
 const printWindow=window.open('','_blank','width=900,height=1100');
 if(!printWindow){toast('Dozvolite otvaranje prozora za štampu.');return;}
 try{
  const ready=new Promise(resolve=>printWindow.addEventListener('load',resolve,{once:true}));
  printWindow.document.open();printWindow.document.write(invoiceHtmlForDocument());printWindow.document.close();
  await ready;await printWindow.document.fonts.ready;
  await Promise.all([...printWindow.document.images].map(img=>img.decode()));
  printWindow.focus();printWindow.print();
 }catch(error){console.error(error);toast('Pregled za štampu nije moguće pripremiti.');}
};
function loadInvoiceCanvas(){
 if(window.html2canvas)return Promise.resolve(window.html2canvas);
 if(!invoiceCanvasLoader)invoiceCanvasLoader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  script.onload=()=>resolve(window.html2canvas);
  script.onerror=()=>{script.remove();invoiceCanvasLoader=null;reject(new Error('Modul za PDF nije učitan. Provjerite internet vezu.'))};
  document.head.appendChild(script);
 });
 return invoiceCanvasLoader;
}
downloadCurrentPdf=async function(){
 if(invoicePdfBusy)return;
 syncInvoiceFromForm();
 if(!validateInvoice())return;
 invoicePdfBusy=true;
 let holder;
 try{
  if(!window.jspdf?.jsPDF)throw new Error('PDF modul nije učitan. Provjerite internet vezu.');
  const capture=await loadInvoiceCanvas();
  await document.fonts.ready;
  const source=document.querySelector('#a4Preview .sample-a4');
  if(!source)throw new Error('Otvorite pregled fakture prije izvoza.');
  const clone=source.cloneNode(true);
  holder=document.createElement('div');
  holder.style.cssText='position:fixed;left:-10000px;top:0;width:794px;pointer-events:none;';
  clone.style.setProperty('margin','0','important');
  clone.style.setProperty('box-shadow','none','important');
  holder.appendChild(clone);document.body.appendChild(holder);
  await Promise.all([...clone.querySelectorAll('img')].map(img=>img.decode()));
  const canvas=await capture(clone,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false});
  const pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
  const pageHeight=Math.round(canvas.width*297/210);
  const box=clone.getBoundingClientRect();
  const boundaries=[...clone.querySelectorAll('tbody tr,.sample-top,.sample-parties,.sample-summary,.sample-bottom')].map(el=>Math.round((el.getBoundingClientRect().bottom-box.top)*2));
  let offset=0,page=0;
  while(offset<canvas.height){
   let end=Math.min(offset+pageHeight,canvas.height);
   if(end<canvas.height){const safe=boundaries.filter(y=>y>offset+pageHeight*.55&&y<=end);if(safe.length)end=Math.max(...safe)}
   const slice=document.createElement('canvas');slice.width=canvas.width;slice.height=end-offset;
   slice.getContext('2d').drawImage(canvas,0,offset,canvas.width,slice.height,0,0,canvas.width,slice.height);
   if(page++)pdf.addPage();
   pdf.addImage(slice.toDataURL('image/png'),'PNG',0,0,210,slice.height*210/canvas.width);
   offset=end;
  }
  pdf.save('faktura-'+String(invoiceState.number).replace(/[^a-z0-9_-]/gi,'-')+'.pdf');
  toast('PDF fakture je preuzet.');
 }catch(error){console.error(error);toast(error.message||'PDF nije moguće generisati.');}
 finally{holder?.remove();invoicePdfBusy=false;}
};
