/* Requested document numbering/language fixes shared by offers and reports. */
(function(){
  nextOfferNumber=function(){return nextConfiguredDocumentNumber('offer',getOffers())};
  const offerDefaultBase=offerDefault;
  offerDefault=function(){const value=offerDefaultBase();value.number=nextOfferNumber();value.documentLanguage=normalizeDocumentLanguage(getSettings().documentLanguage);return value};
  const renderOfferEditorBaseLanguage=renderOfferEditor;
  renderOfferEditor=function(data=null){
    renderOfferEditorBaseLanguage(data);
    offerState.documentLanguage=normalizeDocumentLanguage(offerState.documentLanguage||getSettings().documentLanguage);
    const grid=$('ofNumber')?.closest('.grid-4');
    if(grid&&!$('ofDocumentLanguage')){
      grid.insertAdjacentHTML('beforeend','<div class="field"><label for="ofDocumentLanguage">Jezik dokumenta</label><select id="ofDocumentLanguage"><option value="bs">Bosanski (BS)</option><option value="en">English (EN)</option></select></div>');
      $('ofDocumentLanguage').value=offerState.documentLanguage;
      $('ofDocumentLanguage').onchange=()=>{offerState.documentLanguage=normalizeDocumentLanguage($('ofDocumentLanguage').value);updateOfferPreview()};
    }
    updateOfferPreview();
  };
  const syncOfferBaseLanguage=syncOffer;
  syncOffer=function(){syncOfferBaseLanguage();if($('ofDocumentLanguage'))offerState.documentLanguage=normalizeDocumentLanguage($('ofDocumentLanguage').value)};
  const updateOfferPreviewBaseLanguage=updateOfferPreview;
  updateOfferPreview=function(){
    updateOfferPreviewBaseLanguage();
    const l=documentLabels(offerState.documentLanguage);
    document.querySelectorAll('#offerPreview .sample-a4').forEach(page=>{
      const title=page.querySelector('.sample-title strong');if(title)title.textContent=l.offer;
      const meta=page.querySelectorAll('.sample-title span');if(meta[0])meta[0].textContent=l.issued+' '+formatDate(offerState.issueDate);if(meta[1])meta[1].textContent=l.valid+' '+formatDate(offerState.validUntil);
      const parties=page.querySelectorAll('.sample-parties small');if(parties[0])parties[0].textContent=l.issuer;if(parties[1])parties[1].textContent=l.client;
      const heads=page.querySelectorAll('thead th');[l.items,l.quantity,l.price,l.vat,l.total].forEach((text,index)=>{if(heads[index])heads[index].textContent=text});
      const summary=page.querySelectorAll('.summary-lines em');summary.forEach(node=>{if(/Međuzbir|Subtotal/i.test(node.textContent))node.textContent=l.subtotal;else if(/Popust|Discount/i.test(node.textContent))node.textContent=l.discount;else if(/PDV|VAT/i.test(node.textContent))node.textContent=l.vat});
      const total=page.querySelector('.sample-total span');if(total)total.textContent=l.total;
      const footer=page.querySelectorAll('.sample-bottom small');if(footer[0])footer[0].textContent=offerState.documentLanguage==='en'?'OFFER VALIDITY':'VALIDNOST PONUDE';if(footer[1])footer[1].textContent=l.company;
      const continuation=page.querySelector('.document-continuation-head span');if(continuation)continuation.textContent=l.continuation;
      const next=page.querySelector('.document-continued-footer');if(next)next.textContent=l.nextPage;
      const pageNo=page.querySelector('.document-page-number');if(pageNo)pageNo.textContent=pageNo.textContent.replace('Stranica',l.page);
    });
  };
  const saveOfferBaseLanguage=saveOffer;
  saveOffer=function(){if($('ofDocumentLanguage'))offerState.documentLanguage=normalizeDocumentLanguage($('ofDocumentLanguage').value);return saveOfferBaseLanguage()};

  /* A reset is a state reset followed by a normal render; never blank the result host. */
  const clearReportFiltersBase=window.clearReportFilters;
  window.clearReportFilters=function(){clearReportFiltersBase();requestAnimationFrame(()=>{if(!$('reportResults')&&location.hash==='#reports')renderReports()})};
})();
