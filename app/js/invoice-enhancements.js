/* Invoice editor lifecycle. One owner for autosave, item editing and validation. */
(function () {
  const copy = value => JSON.parse(JSON.stringify(value));
  const cents = value => Math.round((Number(value) || 0) * 100);
  const localDate = date => [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
  let timer = null, pending = false, dragIndex = null, rendering = false;
  const originalRender = renderInvoice;
  const originalNavigate = navigate;
  const originalSaveDraft = saveDraft;
  let preparedDraft = false, firstNavigation = true;
  const initialRoute = location.hash;
  const editorKey=()=> 'invoice-editor-record-'+activeProfileId();
  const rememberEditor=id=>{try{if(id)sessionStorage.setItem(editorKey(),String(id));else sessionStorage.removeItem(editorKey());}catch(_){}};
  const restoredEditor=()=>{try{return getInvoices().find(x=>String(x.id)===sessionStorage.getItem(editorKey()))||null;}catch(_){return null;}};
  const clearTimer = () => { clearTimeout(timer); timer = null; pending = false; };
  function saveMessage(text) {
    ['saveState','topSaveState'].forEach(id => { if($(id)) $(id).textContent = text; });
  }
  function flush() {
    clearTimeout(timer); timer=null;
    if(!pending) return true;
    const ok=originalSaveDraft(copy(invoiceState));
    pending=!ok;
    saveMessage(ok?'Sačuvano '+new Date().toLocaleTimeString('bs-BA',{hour:'2-digit',minute:'2-digit'}):'Spremanje nije uspjelo');
    return ok;
  }
  // Explicit draft handoffs (client/project/offer) differ from editor autosave.
  saveDraft=function(value){preparedDraft=!!value;return originalSaveDraft(value);};
  nextInvoiceNumber=function(){
    return nextConfiguredDocumentNumber('invoice',getInvoices());
  };
  window.invoiceDocumentStatus=x=>x.documentStatus||(['draft','sent','cancelled'].includes(x.status)?x.status:'sent');
  const legacyPaid=paidAmount;
  paidAmount=function(x){
    if(!Array.isArray(x.payments)||!x.payments.length)return legacyPaid(x);
    const sum=x.payments.reduce((s,p)=>s+cents(p.amount),0)+(cents(x.legacyPaidAmount));
    return Math.max(0,Math.min(cents(x.total),sum))/100;
  };
  window.invoicePaymentStatus=function(x){
    if(invoiceDocumentStatus(x)==='cancelled')return 'cancelled';
    const paid=paidAmount(x),total=Number(x.total)||0;
    if(total>0&&cents(paid)>=cents(total))return 'paid';
    if(x.dueDate&&x.dueDate<localDate(new Date())&&invoiceDocumentStatus(x)!=='draft')return 'overdue';
    return paid>0?'partial':'unpaid';
  };
  // Legacy consumers retain their existing API; persisted status is document-only.
  effectiveStatus=function(x){
    const doc=invoiceDocumentStatus(x);
    if(doc==='cancelled'||doc==='draft')return doc;
    return paidAmount(x)>0?(cents(paidAmount(x))>=cents(x.total)?'paid':'partial'):'sent';
  };
  isOverdue=x=>invoicePaymentStatus(x)==='overdue';
  function normalizeLedger(x){
    if(x.legacyPaidAmount===undefined){
      const sum=(x.payments||[]).reduce((s,p)=>s+cents(p.amount),0);
      x.legacyPaidAmount=Math.max(0,cents(legacyPaid(x))-sum)/100;
    }
    x.documentStatus=invoiceDocumentStatus(x);x.status=x.documentStatus;
    return x;
  }
  const originalSaveInvoices=saveInvoices;
  saveInvoices=function(rows){
    rows.forEach(x=>{
      // Explicit document state changes from older callers remain meaningful.
      if(['draft','sent','cancelled'].includes(x.status))x.documentStatus=x.status;
      normalizeLedger(x);
      if(Array.isArray(x.payments))x.paidAmount=Math.min(cents(x.total),
        cents(x.legacyPaidAmount)+x.payments.reduce((s,p)=>s+cents(p.amount),0))/100;
    });
    return originalSaveInvoices(rows);
  };
  persistInvoice=function(){
    pending=true;saveMessage('Spremanje…');
    updatePreview();
    updateInstallmentSummary();
    clearTimeout(timer);
    if(!recurringTemplateContext)timer=setTimeout(flush,400);
    return true;
  };
  window.addEventListener('pagehide',flush);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
  function fresh(){
    rememberEditor(null);
    clearTimer();originalSaveDraft(null);preparedDraft=false;
    loadInvoiceState();
    invoiceState.issueDate=localDate(new Date());
    invoiceState.dueDate=addDays(invoiceState.issueDate,getSettings().dueDays);
    invoiceState.documentStatus='draft';invoiceState.status='draft';
    invoiceState.payments=[];invoiceState.paidAmount=0;
    return copy(invoiceState);
  }
  renderInvoice=function(data=null){
    clearTimer();
    rendering=true;
    originalRender(data);
    normalizeLedger(invoiceState);
    invoiceState.documentLanguage=normalizeDocumentLanguage(invoiceState.documentLanguage||getSettings().documentLanguage);
    if(!recurringTemplateContext)rememberEditor(invoiceState.id);
    if(!invoiceState.id&&!recurringTemplateContext){invoiceState.documentStatus='draft';invoiceState.status='draft';}
    const status=$('invStatus');
    status.innerHTML='<option value="draft">Nacrt</option><option value="sent">Poslano</option><option value="cancelled">Otkazano</option>';
    status.value=invoiceState.documentStatus;
    status.previousElementSibling.textContent='Status dokumenta';
    const paymentBox=document.querySelector('.invoice-status-actions');
    paymentBox.innerHTML='<span id="editorStatusPill" class="status-pill"></span>';
    if(invoiceState.id&&invoiceState.documentStatus!=='cancelled'){
      const button=document.createElement('button');button.className='btn light tiny';button.textContent='Uplate';
      button.onclick=()=>showInvoicePayments(invoiceState.id);paymentBox.appendChild(button);
      if(paidAmount(invoiceState)<Number(invoiceState.total)){
        const add=document.createElement('button');add.className='btn success tiny';add.textContent='+ Evidentiraj uplatu';
        add.onclick=()=>recordCurrentPayment();paymentBox.appendChild(add);
      }
    }
    const issue=$('invIssueDate'),due=$('invDueDate');
    due.addEventListener('input',()=>{invoiceState.dueDateManual=true;persistInvoice();});
    issue.addEventListener('input',()=>{
      if(!invoiceState.dueDateManual&&issue.value){
        due.value=addDays(issue.value,invoiceState.dueDays??getSettings().dueDays);syncInvoiceFromForm();
      }
    });
    status.addEventListener('change',()=>{invoiceState.documentStatus=status.value;persistInvoice();});
    $('invCurrency').addEventListener('change',()=>{
      if(!invoiceState.id&&!invoiceState.bankAccountManual){
        Object.assign(invoiceState,invoiceBankDefaults(invoiceState.currency));
        if($('invBankAccount'))$('invBankAccount').value=invoiceState.bankAccountId;
      }
      invoiceState.items.forEach((_,i)=>updateItemTotal(i));persistInvoice();
    });
    if($('invBankAccount')){
      const select=$('invBankAccount'),saved=invoiceState.bankAccountSnapshot;
      if(saved&&!Array.from(select.options).some(o=>o.value===invoiceState.bankAccountId))
        select.add(new Option(saved.name||'Sačuvani račun',invoiceState.bankAccountId));
      select.value=invoiceState.bankAccountId||'';
      select.onchange=()=>{
        const account=(getSettings().bankAccounts||[]).find(x=>String(x.id)===select.value);
        invoiceState.bankAccountId=account?.id||'';invoiceState.bankAccountSnapshot=account?copy(account):null;
        invoiceState.bankAccountManual=true;persistInvoice();
      };
    }
    const optionsGrid=$('invCurrency')?.closest('.grid-3');
    if(optionsGrid&&!$('invDocumentLanguage')){
      optionsGrid.classList.add('invoice-document-options');
      optionsGrid.insertAdjacentHTML('beforeend',`<div class="field"><label for="invDocumentLanguage">Jezik dokumenta</label><select id="invDocumentLanguage"><option value="bs">Bosanski (BS)</option><option value="en">English (EN)</option></select></div>`);
      $('invDocumentLanguage').value=invoiceState.documentLanguage;
      $('invDocumentLanguage').onchange=()=>{invoiceState.documentLanguage=normalizeDocumentLanguage($('invDocumentLanguage').value);persistInvoice();};
    }
    const picker=$('clientPicker');
    if(invoiceState.clientId){picker.classList.remove('placeholder');picker.textContent='Povezani klijent: '+invoiceState.clientName;}
    const actions=document.querySelector('#viewContainer .page-actions');
    const send=Array.from(actions.querySelectorAll('button')).find(b=>b.textContent.includes('Pošalji'));
    if(send)send.onclick=()=>sendEditorInvoice();
    document.querySelectorAll('.invoice-editor .field').forEach(field=>{
      const label=field.querySelector('label'),input=field.querySelector('input,select,textarea');
      if(label&&input?.id)label.htmlFor=input.id;
    });
    renderItems();rendering=false;updatePreview();updateInstallmentSummary();
  };
  // Resolve the current function at navigation time, not the old captured renderer.
  routes.invoice=()=>renderInvoice(getDraft()||restoredEditor());
  navigate=function(route){
    if(pending&&!flush()){
      toast('Nacrt nije sačuvan. Ostanite u editoru i pokušajte ponovo.');return;
    }
    const restore=firstNavigation&&initialRoute==='#invoice';
    firstNavigation=false;
    if(route==='invoice'){
      if(preparedDraft){preparedDraft=false;}
      else if(!$('invNumber')&&!restore){fresh();}
    }
    return originalNavigate(route);
  };
  newInvoice=function(){
    confirmAction('Kreirati novu fakturu? Trenutni radni nacrt će biti očišćen. Već sačuvana faktura ostaje nepromijenjena.',()=>{
      const data=fresh();renderInvoice(data);
    });
  };
  editInvoice=function(id){
    if(pending&&!flush())return;
    const x=getInvoices().find(v=>String(v.id)===String(id));if(!x)return;
    saveDraft(copy(x));navigate('invoice');
  };
  const syncBase=syncInvoiceFromForm;
  syncInvoiceFromForm=function(){
    if(!$('invNumber'))return;
    invoiceState.documentStatus=$('invStatus').value||invoiceDocumentStatus(invoiceState);
    syncBase();
    if($('clientCountry'))invoiceState.clientCountry=$('clientCountry').value;
    if($('invDocumentLanguage'))invoiceState.documentLanguage=normalizeDocumentLanguage($('invDocumentLanguage').value);
  };
  const previewBase=updatePreview;
  updatePreview=function(){
    const t=invoiceTotals(invoiceState.items,invoiceState.globalDiscountType,invoiceState.globalDiscount);
    invoiceState.total=t.total;
    updateInstallmentSummary();previewBase();
    localizeInvoicePreview();
    const label={unpaid:'Neplaćeno',partial:'Djelimično plaćeno',paid:'Plaćeno',overdue:'Dospjelo',cancelled:'Otkazano'};
    const st=invoicePaymentStatus(invoiceState),pill=$('editorStatusPill');
    if(pill){pill.className='status-pill status-'+(st==='unpaid'?'sent':st);pill.textContent='Naplata: '+label[st];}
    const doc=$('previewStatus');
    if(doc){doc.className='status-pill status-'+invoiceDocumentStatus(invoiceState);doc.textContent={draft:'Nacrt',sent:'Poslano',cancelled:'Otkazano'}[invoiceDocumentStatus(invoiceState)];}
  };
  function localizeInvoicePreview(){
    const labels=documentLabels(invoiceState.documentLanguage),pages=[...document.querySelectorAll('#a4Preview .sample-a4')];
    pages.forEach(page=>{
      const title=page.querySelector('.sample-title strong');if(title)title.textContent=labels.invoice;
      const meta=page.querySelectorAll('.sample-title span');if(meta[0])meta[0].textContent=labels.issued+' '+formatDate(invoiceState.issueDate);if(meta[1])meta[1].textContent=labels.due+' '+formatDate(invoiceState.dueDate);
      const parties=page.querySelectorAll('.sample-parties small');if(parties[0])parties[0].textContent=labels.issuer;if(parties[1])parties[1].textContent=labels.client;
      const heads=page.querySelectorAll('thead th');[labels.items,labels.quantity,labels.price,labels.vat,labels.total].forEach((text,index)=>{if(heads[index])heads[index].textContent=text});
      const summary=page.querySelectorAll('.summary-lines em');summary.forEach(node=>{if(/Međuzbir|Subtotal/i.test(node.textContent))node.textContent=labels.subtotal;else if(/Popust|Discount/i.test(node.textContent))node.textContent=labels.discount;else if(/PDV|VAT/i.test(node.textContent))node.textContent=labels.vat});
      const total=page.querySelector('.sample-total span');if(total)total.textContent=labels.total;
      const footer=page.querySelectorAll('.sample-bottom small');if(footer[0])footer[0].textContent=labels.payment;if(footer[1])footer[1].textContent=labels.company;
      const continuation=page.querySelector('.document-continuation-head span');if(continuation)continuation.textContent=labels.continuation;
      const next=page.querySelector('.document-continued-footer');if(next)next.textContent=labels.nextPage;
      const pageNo=page.querySelector('.document-page-number');if(pageNo)pageNo.textContent=pageNo.textContent.replace('Stranica',labels.page);
    });
  }
  window.reorderInvoiceItems=function(from,to){
    if(!Number.isInteger(from)||!Number.isInteger(to)||from===to||from<0||to<0||from>=invoiceState.items.length||to>=invoiceState.items.length)return;
    const moved=invoiceState.items.splice(from,1)[0];invoiceState.items.splice(to,0,moved);
    persistInvoice();renderItems();
  };
  renderItems=function(){
    const body=$('itemsBody');if(!body)return;
    const head=body.closest('table').querySelector('thead tr');
    head.innerHTML='<th></th><th>Naziv i opis stavke</th><th>Količina / jedinica</th><th>Cijena</th><th>Popust %</th><th>PDV %</th><th>Ukupno</th><th></th>';
    body.innerHTML=invoiceState.items.map((x,i)=>`<tr data-row="${i}">
      <td class="item-drag"><button type="button" class="item-drag-handle" draggable="true" aria-label="Pomjeri stavku ${i+1}" title="Povucite red; strelice gore/dolje za tastaturu">⠿</button></td>
      <td><input aria-label="Naziv stavke ${i+1}" data-item="${i}" data-k="description" value="${esc(x.description||'')}" placeholder="Naziv stavke"><input aria-label="Opis stavke ${i+1}" class="item-description" data-item="${i}" data-k="itemDescription" value="${esc(x.itemDescription||'')}" placeholder="Opis stavke"></td>
      <td><input aria-label="Količina ${i+1}" class="num" type="number" min="0.001" step="any" data-item="${i}" data-k="qty" value="${x.qty}"><input aria-label="Jedinica ${i+1}" data-item="${i}" data-k="unit" value="${esc(x.unit||'')}" placeholder="kom, h, kg"></td>
      ${['price','discount','vat'].map(k=>`<td><input aria-label="${{price:'Cijena',discount:'Popust',vat:'PDV'}[k]} ${i+1}" class="num" type="number" min="0" ${k!=='price'?'max="100"':''} step="any" data-item="${i}" data-k="${k}" value="${x[k]??0}"></td>`).join('')}
      <td id="itemTotal${i}"></td><td><button type="button" class="duplicate-item" aria-label="Dupliciraj stavku ${i+1}" onclick="duplicateInvoiceItem(${i})">⧉</button><button type="button" class="remove-item" aria-label="Obriši stavku ${i+1}" onclick="removeInvoiceItem(${i})">×</button></td></tr>`).join('');
    body.querySelectorAll('[data-item]').forEach(input=>input.oninput=()=>{
      const i=Number(input.dataset.item),key=input.dataset.k;
      invoiceState.items[i][key]=['description','itemDescription','unit'].includes(key)?input.value:(input.value===''?'':Number(input.value));
      updateItemTotal(i);persistInvoice();
    });
    body.querySelectorAll('tr[data-row]').forEach(row=>{
      const handle=row.querySelector('.item-drag-handle'),i=Number(row.dataset.row);
      handle.ondragstart=e=>{
        dragIndex=i;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(i));
        e.dataTransfer.setDragImage(row,16,16);row.classList.add('dragging');
      };
      handle.ondragend=()=>{dragIndex=null;body.querySelectorAll('tr').forEach(r=>r.classList.remove('dragging','item-drop-target'));};
      handle.onkeydown=e=>{
        if(e.key==='ArrowUp'||e.key==='ArrowDown'){
          e.preventDefault();e.stopPropagation();const target=i+(e.key==='ArrowUp'?-1:1);reorderInvoiceItems(i,target);
          body.querySelector(`tr[data-row="${Math.max(0,Math.min(invoiceState.items.length-1,target))}"] .item-drag-handle`)?.focus();
        }
      };
      row.ondragover=e=>{if(dragIndex===null)return;e.preventDefault();e.dataTransfer.dropEffect='move';body.querySelectorAll('.item-drop-target').forEach(r=>r.classList.remove('item-drop-target'));if(i!==dragIndex)row.classList.add('item-drop-target');};
      row.ondrop=e=>{e.preventDefault();const from=dragIndex;dragIndex=null;reorderInvoiceItems(from,i);};
      updateItemTotal(i);
    });
    renderMilestones();
  };
  duplicateInvoiceItem=i=>{if(!invoiceState.items[i])return;invoiceState.items.splice(i+1,0,copy(invoiceState.items[i]));persistInvoice();renderItems();};
  addCatalogToInvoice=function(){
    const rows=getCatalog().map((x,i)=>({x,i})).filter(({x})=>x.active!==false);
    openModal('Dodaj iz kataloga',`<div class="catalog-invoice-picker">${rows.map(({x,i})=>`<label><input type="checkbox" value="${i}"><span><strong>${esc(x.name)}</strong><small>${money(x.price,x.currency||invoiceState.currency)} · PDV ${x.vat||0}% · ${esc(x.unit||'')}</small></span></label>`).join('')||'<div class="empty">Katalog je prazan.</div>'}</div>`, '<div class="modal-actions"><button class="btn light" onclick="closeModal()">Odustani</button><button class="btn accent" onclick="addSelectedCatalogItems()">Dodaj odabrane</button></div>');
  };
  addSelectedCatalogItems=function(){
    const all=getCatalog(),selected=Array.from(document.querySelectorAll('.catalog-invoice-picker input:checked')).map(x=>all[Number(x.value)]);
    if(!selected.length){toast('Odaberite barem jednu stavku.');return;}
    if(selected.some(x=>x.currency&&x.currency!==invoiceState.currency)){toast('Valuta kataloških stavki mora odgovarati valuti fakture. Automatska konverzija nije dostupna.');return;}
    selected.forEach(x=>invoiceState.items.push({description:x.name||'',itemDescription:x.description||'',qty:1,price:Number(x.price)||0,discount:Number(x.discount)||0,vat:Number(x.vat)||0,unit:x.unit||'',catalogId:x.id||x.code||''}));
    closeModal();persistInvoice();renderItems();
  };
  const selectBase=selectClient;
  selectClient=function(i){
    const oldDue=invoiceState.dueDate,manual=invoiceState.dueDateManual;
    selectBase(i);invoiceState.dueDays=getClients()[i]?.defaultDueDays??getSettings().dueDays;
    if(manual){invoiceState.dueDate=oldDue;$('invDueDate').value=oldDue;}
    if(!invoiceState.bankAccountManual&&!invoiceState.id){Object.assign(invoiceState,invoiceBankDefaults(invoiceState.currency));if($('invBankAccount'))$('invBankAccount').value=invoiceState.bankAccountId;}
    persistInvoice();
  };
  const commitBase=commitClientRecord;
  commitClientRecord=function(client,index){
    if(!$('invNumber'))return commitBase(client,index);
    const rows=getClients();if(index===null)rows.push(client);else rows[index]=client;
    if(!saveClients(rows))return;
    closeModal();renderClientOptions();selectClient(index===null?rows.length-1:index);toast('Klijent je sačuvan i povezan s fakturom.');
  };
  renderMilestones=function(){
    const box=$('milestonesBody');if(!box)return;
    const rows=invoiceState.milestones||[];
    box.innerHTML=(rows.length?`<div class="invoice-installment-list">${rows.map((m,i)=>`<div class="invoice-installment">
      <div class="invoice-installment-number">${i+1}</div>
      <div class="field"><label>Naziv rate ${i+1}</label><input aria-label="Naziv rate ${i+1}" value="${esc(m.name||'')}" oninput="updateMilestone(${i},'name',this.value)"></div>
      <div class="field"><label>Rok rate ${i+1}</label><input aria-label="Rok rate ${i+1}" type="date" value="${esc(m.dueDate||'')}" oninput="updateMilestone(${i},'dueDate',this.value)"></div>
      <div class="field invoice-installment-value"><label>Iznos / procenat</label><div><input aria-label="Iznos rate ${i+1}" type="number" min="0" step="any" value="${m.mode==='percent'?m.percent:m.amount||0}" oninput="updateMilestone(${i},'value',this.value)"><select aria-label="Vrsta rate ${i+1}" onchange="updateMilestone(${i},'mode',this.value);renderMilestones()"><option value="amount" ${m.mode!=='percent'?'selected':''}>${esc(invoiceState.currency)}</option><option value="percent" ${m.mode==='percent'?'selected':''}>%</option></select></div></div>
      <div class="invoice-installment-actions"><span data-installment-paid="${i}">${money(m.paidAmount||0,invoiceState.currency)} plaćeno</span><button type="button" class="remove-item" aria-label="Obriši ratu ${i+1}" onclick="removeMilestone(${i})">×</button></div>
      </div>`).join('')}</div>`:'<div class="empty compact-empty">Rate nisu definisane. Dodajte ih samo kada je plaćanje dogovoreno u više dijelova.</div>')+'<div id="installmentSummary" class="invoice-installment-summary" role="status"></div>';
    updateInstallmentSummary();
  };
  function installmentErrors(){
    const rows=invoiceState.milestones||[],errors=[],total=invoiceTotals(invoiceState.items,invoiceState.globalDiscountType,invoiceState.globalDiscount).total;
    rows.forEach((m,i)=>{
      if(m.mode==='percent')m.amount=Math.round(total*Number(m.percent))/100;
      if(!String(m.name||'').trim())errors.push('Rata '+(i+1)+': unesite naziv.');
      if(!validDate(m.dueDate))errors.push('Rata '+(i+1)+': odaberite ispravan datum.');
      if(!Number.isFinite(Number(m.amount))||Number(m.amount)<=0)errors.push('Rata '+(i+1)+': iznos mora biti veći od nule.');
      if(m.mode==='percent'&&(!(Number(m.percent)>0)||Number(m.percent)>100))errors.push('Rata '+(i+1)+': procenat mora biti od 0 do 100%.');
      if(cents(m.paidAmount)>cents(m.amount))errors.push('Rata '+(i+1)+': iznos je manji od već plaćenog.');
    });
    if(rows.length&&rows.reduce((s,m)=>s+cents(m.amount),0)!==cents(total))errors.push('Zbir rata mora biti jednak ukupnom iznosu fakture.');
    return errors;
  }
  function updateInstallmentSummary(){
    const errors=installmentErrors(),box=$('installmentSummary');
    if(box){box.textContent=(invoiceState.milestones||[]).length?'Ukupno rata: '+money(invoiceState.milestones.reduce((s,m)=>s+Number(m.amount||0),0),invoiceState.currency)+'. '+errors.join(' '):'Rate su opcionalne.';box.classList.toggle('invoice-validation-error',errors.length>0);}
  }
  updateMilestone=function(i,k,v){
    const m=invoiceState.milestones[i];if(!m)return;
    if(k==='value'){if(m.mode==='percent')m.percent=Number(v);else m.amount=Number(v);}
    else m[k]=v;
    persistInvoice();
  };
  removeMilestone=function(i){
    const m=invoiceState.milestones[i];if(!m)return;
    if(m.paidAmount>0||(invoiceState.payments||[]).some(p=>p.milestoneId===m.id)){toast('Plaćena rata se ne može ukloniti. Prvo ispravite povezanu uplatu.');return;}
    invoiceState.milestones.splice(i,1);persistInvoice();renderMilestones();
  };
  function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(new Date(value+'T12:00:00').getTime())&&localDate(new Date(value+'T12:00:00'))===value;}
  validateInvoice=function(){
    const errors=[];
    document.querySelectorAll('.invoice-editor [aria-invalid]').forEach(x=>x.removeAttribute('aria-invalid'));
    function error(text,selector){errors.push(text);document.querySelector(selector)?.setAttribute('aria-invalid','true');}
    if(!String(invoiceState.number||'').trim())error('Unesite broj fakture.','#invNumber');
    if(!recurringTemplateContext&&getInvoices().some(x=>String(x.id)!==String(invoiceState.id)&&String(x.number).trim()===String(invoiceState.number).trim()))error('Broj fakture već postoji. Unesite slobodan broj.','#invNumber');
    if(!validDate(invoiceState.issueDate))error('Odaberite datum izdavanja.','#invIssueDate');
    if(!validDate(invoiceState.dueDate)||invoiceState.dueDate<invoiceState.issueDate)error('Rok plaćanja mora biti datum izdavanja ili kasniji.','#invDueDate');
    if(!String(invoiceState.clientName||'').trim())error('Unesite ili odaberite klijenta.','#clientName');
    if(!invoiceState.items.length)errors.push('Dodajte barem jednu stavku.');
    invoiceState.items.forEach((x,i)=>{
      if(!String(x.description||'').trim())error('Stavka '+(i+1)+': unesite naziv.',`[data-item="${i}"][data-k="description"]`);
      ['qty','price','discount','vat'].forEach(k=>{
        const v=Number(x[k]);
        if(x[k]===''||!Number.isFinite(v)||v<0||(k==='qty'&&v<=0)||(['discount','vat'].includes(k)&&v>100))
          error('Stavka '+(i+1)+': neispravna vrijednost polja '+({qty:'količina',price:'cijena',discount:'popust',vat:'PDV'}[k])+'.',`[data-item="${i}"][data-k="${k}"]`);
      });
    });
    const base=calcItems(invoiceState.items).reduce((s,x)=>s+x.after,0),discount=Number(invoiceState.globalDiscount);
    if(!Number.isFinite(discount)||discount<0||discount>(invoiceState.globalDiscountType==='percent'?100:base))error('Globalni popust prelazi dozvoljeni iznos.','#invDiscount');
    errors.push(...installmentErrors());
    const total=invoiceTotals(invoiceState.items,invoiceState.globalDiscountType,invoiceState.globalDiscount).total;
    const recorded=cents(invoiceState.legacyPaidAmount)+(invoiceState.payments||[]).reduce((s,p)=>s+cents(p.amount),0);
    if(recorded>cents(total))errors.push('Ukupan iznos fakture ne smije biti manji od evidentiranih uplata.');
    $('invoiceValidation')?.remove();
    if(errors.length){
      const panel=document.createElement('div');panel.id='invoiceValidation';panel.className='card section-card invoice-validation-error';panel.setAttribute('role','alert');
      panel.innerHTML='<strong>Provjerite sljedeća polja:</strong><ul>'+errors.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ul>';
      document.querySelector('.invoice-editor')?.prepend(panel);panel.scrollIntoView({block:'nearest'});return false;
    }
    return true;
  };
  saveInvoiceRecord=function(options={}){
    syncInvoiceFromForm();
    if(!validateInvoice())return false;
    clearTimer();
    const list=getInvoices(),index=list.findIndex(x=>String(x.id)===String(invoiceState.id)),previous=index>=0?list[index]:null;
    const t=invoiceTotals(invoiceState.items,invoiceState.globalDiscountType,invoiceState.globalDiscount);
    const record=copy({...invoiceState,id:invoiceState.id||Date.now(),total:t.total,vatTotal:t.vat,subtotal:t.subtotal,createdAt:invoiceState.createdAt||Date.now(),updatedAt:Date.now()});
    record.status=record.documentStatus=invoiceDocumentStatus(invoiceState);
    record.companySnapshot=previous?.companySnapshot||copy(getCompany());
    record.clientSnapshot={name:record.clientName,address:record.clientAddress,city:record.clientCity,country:record.clientCountry,email:record.clientEmail,id:record.clientIdNo,vat:record.clientVat};
    if(index>=0)list[index]=record;else list.unshift(record);
    if(!saveInvoices(list)){pending=true;saveMessage('Spremanje nije uspjelo');return false;}
    invoiceState=copy(record);originalSaveDraft(null);preparedDraft=false;
    if(record.sourceOfferId)saveOffers(getOffers().filter(x=>String(x.id)!==String(record.sourceOfferId)));
    if(record.sourceProformaId&&typeof getProformas==='function'){
      const proformas=getProformas(),source=proformas.find(x=>String(x.id)===String(record.sourceProformaId));
      if(source){source.invoiceId=record.id;source.status='converted';source.updatedAt=Date.now();saveProformas(proformas);}
    }
    updateInvoiceBadge();saveMessage('Sačuvano '+new Date().toLocaleTimeString('bs-BA',{hour:'2-digit',minute:'2-digit'}));
    if(options.stay)renderInvoice(record);else navigate('invoices');
    toast('Faktura '+record.number+' je sačuvana.');return true;
  };
  window.sendEditorInvoice=function(){
    if(saveInvoiceRecord({stay:true}))emailInvoice(invoiceState.id);
  };
  recordCurrentPayment=function(){
    if(!invoiceState.id){toast('Prvo sačuvajte fakturu.');return;}
    if(saveInvoiceRecord({stay:true}))recordPaymentModal(invoiceState.id);
  };
  markCurrentInvoicePaid=recordCurrentPayment;
  function reconcilePayments(x){
    x.paidAmount=(cents(x.legacyPaidAmount)+(x.payments||[]).reduce((s,p)=>s+cents(p.amount),0))/100;
    (x.milestones||[]).forEach((m,i)=>{m.id=m.id||`milestone_${x.id}_${i}`;m.paidAmount=0;});
    let unassigned=0;
    (x.payments||[]).forEach(p=>{const m=(x.milestones||[]).find(m=>m.id===p.milestoneId);if(m)m.paidAmount+=Number(p.amount);else unassigned+=cents(p.amount);});
    (x.milestones||[]).forEach(m=>{const amount=Math.min(unassigned,Math.max(0,cents(m.amount)-cents(m.paidAmount)));m.paidAmount+=amount/100;unassigned-=amount;});
  }
  window.editPayment=function(id,index=null){
    const x=getInvoices().find(v=>String(v.id)===String(id));if(!x||invoiceDocumentStatus(x)==='cancelled')return;
    normalizeLedger(x);const old=index===null?{}:x.payments?.[index];if(!old)return;
    const max=cents(x.total)-cents(x.legacyPaidAmount)-(x.payments||[]).reduce((s,p,i)=>s+(i===index?0:cents(p.amount)),0);
    if(max<=0){toast('Faktura je u potpunosti plaćena.');return;}
    openModal(index===null?'Evidentiraj uplatu':'Uredi uplatu',`<p>${esc(x.number)} · ${esc(x.clientName)} · Preostalo ${money(max/100,x.currency)}</p><div class="grid-2"><div class="field"><label for="pcAmount">Iznos uplate</label><input id="pcAmount" type="number" step="0.01" value="${old.amount??max/100}"></div><div class="field"><label for="pcDate">Datum uplate</label><input id="pcDate" type="date" value="${old.date||localDate(new Date())}"></div><div class="field"><label for="pcMethod">Način uplate</label><select id="pcMethod">${['Bankovni transfer','Gotovina','Kartica','PayPal','Ostalo'].map(v=>`<option>${v}</option>`).join('')}</select></div><div class="field"><label for="pcReference">Referenca</label><input id="pcReference" value="${esc(old.reference||'')}"></div><div class="field"><label for="pcNote">Napomena uplate</label><textarea id="pcNote">${esc(old.note||'')}</textarea></div><div class="field"><label for="pcMilestone">Rata</label><select id="pcMilestone"><option value="">Automatski rasporedi</option>${(x.milestones||[]).map((m,i)=>`<option value="${esc(m.id||`milestone_${x.id}_${i}`)}">${esc(m.name)}</option>`).join('')}</select></div></div>`,`<div class="modal-actions"><button class="btn light" onclick="closeModal()">Odustani</button><button id="saveEditorPayment" class="btn accent">Sačuvaj uplatu</button></div>`);
    $('pcMethod').value=old.method||x.paymentMethod||'Bankovni transfer';$('pcMilestone').value=old.milestoneId||'';
    $('saveEditorPayment').onclick=()=>savePaymentRecord(id,index);
  };
  recordPaymentModal=id=>editPayment(id,null);
  window.savePaymentRecord=function(id,index){
    const list=getInvoices(),x=list.find(v=>String(v.id)===String(id));if(!x)return;normalizeLedger(x);
    const amount=Number($('pcAmount').value),date=$('pcDate').value;
    const other=cents(x.legacyPaidAmount)+(x.payments||[]).reduce((s,p,i)=>s+(i===index?0:cents(p.amount)),0);
    if(!Number.isFinite(amount)||amount<=0||cents(amount)+other>cents(x.total)||!validDate(date)){toast('Unesite ispravan datum i pozitivan iznos koji ne prelazi preostali iznos fakture.');return;}
    const p={...(x.payments?.[index]||{}),id:x.payments?.[index]?.id||Date.now(),amount:cents(amount)/100,date,method:$('pcMethod').value,reference:$('pcReference').value.trim(),note:$('pcNote').value.trim(),milestoneId:$('pcMilestone').value};
    x.payments=x.payments||[];if(index===null)x.payments.push(p);else x.payments[index]=p;
    if(x.documentStatus==='draft')x.documentStatus=x.status='sent';
    reconcilePayments(x);if(!saveInvoices(list))return;closeModal();refreshCurrentView();toast('Uplata je sačuvana.');
  };
  window.deletePaymentRecord=function(id,index){
    const list=getInvoices(),x=list.find(v=>String(v.id)===String(id)),p=x?.payments?.[index];if(!p)return;normalizeLedger(x);
    confirmAction(`Obrisati uplatu ${money(p.amount,x.currency)} za fakturu ${x.number}, klijent ${x.clientName}? Iznos naplate i stanje rata bit će ponovo izračunati. Ova radnja se ne može opozvati.`,()=>{x.payments.splice(index,1);reconcilePayments(x);if(saveInvoices(list)){closeModal();refreshCurrentView();toast('Uplata je obrisana.');}});
  };
  window.showInvoicePayments=function(id){
    const x=getInvoices().find(v=>String(v.id)===String(id));if(!x)return;normalizeLedger(x);
    openModal('Uplate · '+x.number,`${x.legacyPaidAmount?`<p>Ranije evidentirano bez pojedinačnih transakcija: ${money(x.legacyPaidAmount,x.currency)}</p>`:''}<div class="payment-history">${(x.payments||[]).map((p,i)=>`<div class="payment-history-row"><div><strong>${money(p.amount,x.currency)}</strong><small>${esc(formatDate(p.date))} · ${esc(p.method||'')}</small><span>${esc(p.reference||'')} ${esc(p.note||'')}</span></div><div class="row-actions"><button class="btn light tiny" data-edit-payment="${i}">Uredi</button><button class="btn danger tiny" data-delete-payment="${i}">Obriši</button></div></div>`).join('')||'<p>Nema pojedinačnih uplata.</p>'}</div>`,`<div class="modal-actions"><button class="btn light" onclick="closeModal()">Zatvori</button>${paidAmount(x)<x.total&&invoiceDocumentStatus(x)!=='cancelled'?'<button id="addHistoryPayment" class="btn accent">＋ Evidentiraj uplatu</button>':''}</div>`);
    document.querySelectorAll('[data-edit-payment]').forEach(b=>b.onclick=()=>editPayment(id,Number(b.dataset.editPayment)));
    document.querySelectorAll('[data-delete-payment]').forEach(b=>b.onclick=()=>deletePaymentRecord(id,Number(b.dataset.deletePayment)));
    if($('addHistoryPayment'))$('addHistoryPayment').onclick=()=>editPayment(id,null);
  };
  saveInvoiceStatus=function(id,status){
    if(['partial','paid'].includes(status)){recordPaymentModal(id);return;}
    if(!['draft','sent','cancelled'].includes(status))return;
    const rows=getInvoices(),x=rows.find(v=>String(v.id)===String(id));if(!x)return;
    normalizeLedger(x);x.status=x.documentStatus=status;if(saveInvoices(rows)){refreshCurrentView();toast('Status dokumenta je sačuvan.');}
  };
  // Refresh after a payment must reload the persisted record, not an old editor draft.
  const refreshBase=refreshCurrentView;
  refreshCurrentView=function(){
    if($('invNumber')&&invoiceState.id){
      const row=getInvoices().find(x=>String(x.id)===String(invoiceState.id));if(row){clearTimer();renderInvoice(row);return;}
    }
    return refreshBase();
  };
})();
