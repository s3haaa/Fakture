(function(){
  const statuses=[['open','Otvoreno'],['in_progress','U toku'],['done','Završeno']];
  const priorities=[['low','Nizak'],['normal','Normalan'],['high','Visok'],['urgent','Hitno']];
  const label=(list,key)=>list.find(x=>x[0]===key)?.[1]||key||'';
  const isoToday=()=>new Date().toISOString().slice(0,10);
  const taskRows=()=>{
    const clients=typeof getClients==='function'?getClients():[];
    const projects=extGet('projects');
    const rows=extGet('tasks');
    let changed=false;
    const out=rows.map((raw,index)=>{
      const row={...raw};
      if(!row.id){row.id=`task-${Date.now()}-${index}-${Math.random().toString(36).slice(2,7)}`;changed=true}
      if(!row.status) {row.status=row.done?'done':'open';changed=true}
      const oldPriority=String(row.priority||'').toLowerCase();
      const priorityMap={'nizak':'low','normalan':'normal','normal':'normal','visok':'high','hitno':'urgent'};
      if(priorityMap[oldPriority]&&priorityMap[oldPriority]!==row.priority){row.priority=priorityMap[oldPriority];changed=true}
      if(!row.priority){row.priority='normal';changed=true}
      if(row.client&&!row.clientId){const c=clients.find(x=>String(x.name||'').toLowerCase()===String(row.client).toLowerCase());if(c){row.clientId=c.id||c.clientId;changed=true}}
      if(row.clientId&&!row.client){const c=clients.find(x=>String(x.id||x.clientId)===String(row.clientId));if(c){row.client=c.name;changed=true}}
      if(row.project&&!row.projectId){const p=projects.find(x=>String(x.name||'').toLowerCase()===String(row.project).toLowerCase());if(p){row.projectId=p.id;changed=true}}
      if(row.projectId&&!row.project){const p=projects.find(x=>String(x.id)===String(row.projectId));if(p){row.project=p.name;changed=true}}
      const done=row.status==='done'; if(!!row.done!==done){row.done=done;changed=true}
      return row;
    });
    if(changed)extSet('tasks',out);
    return out;
  };
  const persist=rows=>extSet('tasks',rows);
  const dateText=value=>value?formatDate(value):'Bez roka';
  const overdue=t=>t.due&&t.status!=='done'&&t.due<isoToday();
  function taskView(){return window.taskCurrentView||'all'}
  function setTaskView(view){window.taskCurrentView=view;renderTasks()}
  window.setTaskView=setTaskView;
  function taskMatchesView(t,view){
    if(view==='done')return t.status==='done';
    if(view==='today')return t.due===isoToday();
    if(view==='week'){const d=t.due?new Date(`${t.due}T12:00:00`):null;if(!d)return false;const now=new Date();const day=(now.getDay()+6)%7;const start=new Date(now);start.setHours(0,0,0,0);start.setDate(now.getDate()-day);const end=new Date(start);end.setDate(start.getDate()+7);return d>=start&&d<end}
    if(view==='overdue')return overdue(t);
    return true;
  }
  function taskCard(t,index){
    const status=t.status||'open', priority=t.priority||'normal';
    return `<article class="task-card task-card-rich ${overdue(t)?'task-overdue':''}" data-bulk-key="${index}" data-task-id="${esc(t.id)}" tabindex="0">
      <div class="task-card-main"><div class="task-card-title-row"><h3>${esc(t.name||'Bez naziva')}</h3><span class="task-status-pill task-status-${status}">${esc(label(statuses,status))}</span></div>
      ${t.description?`<p class="task-description">${esc(t.description)}</p>`:''}${t.note?`<p class="task-note">${esc(t.note)}</p>`:''}
      <div class="task-meta"><span class="task-priority-pill task-priority-${priority}">${esc(label(priorities,priority))}</span><span class="task-due ${overdue(t)?'is-overdue':''}">${esc(overdue(t)?'Dospjelo · ':'Rok · ')}${esc(dateText(t.due))}</span>${t.client?`<span>Klijent: ${esc(t.client)}</span>`:''}${t.project?`<span>Projekt: ${esc(t.project)}</span>`:''}</div></div>
      <div class="task-card-actions"><button class="btn light tiny" onclick="taskDetail(${index})">Pregled</button><button class="btn light tiny" onclick="editTask(${index})">Uredi</button><button class="btn ${status==='done'?'light':'success'} tiny" onclick="toggleTaskStatus(${index},'${status==='done'?'open':'done'}')">${status==='done'?'Ponovo otvori':'Završi'}</button><button class="btn danger tiny" onclick="deleteTask(${index})">Obriši</button></div>
    </article>`;
  }
  renderTasks=function(){
    const all=taskRows(), q=($('taskSearch')?.value||'').trim().toLowerCase(), status=$('taskStatusFilter')?.value||'', priority=$('taskPriorityFilter')?.value||'', client=$('taskClientFilter')?.value||'', project=$('taskProjectFilter')?.value||'', due=$('taskDueFilter')?.value||'';
    const rows=all.map((task,index)=>({task,index})).filter(({task})=>taskMatchesView(task,taskView())&&(!q||`${task.name} ${task.description||''} ${task.note||''} ${task.client||''} ${task.project||''}`.toLowerCase().includes(q))&&(!status||task.status===status)&&(!priority||task.priority===priority)&&(!client||String(task.clientId||'')===client)&&(!project||String(task.projectId||'')===project)&&(!due||task.due===due));
    const clients=typeof getClients==='function'?getClients().filter(c=>!c.archived):[], projects=extGet('projects');
    $('viewContainer').innerHTML=`<div class="page tasks-page"><div class="page-heading"><div><h1>Zadaci</h1><p class="page-subtitle">Jednostavan pregled rokova, prioriteta i povezanih zapisa.</p></div><div class="page-actions"><button class="btn accent" onclick="addTask()">＋ Novi zadatak</button></div></div>
      <div class="task-view-tabs">${[['all','Svi'],['today','Danas'],['week','Ove sedmice'],['overdue','Dospjelo'],['done','Završeno']].map(([v,l])=>`<button class="btn ${taskView()===v?'accent':'light'} small" onclick="setTaskView('${v}')">${l}</button>`).join('')}</div>
      <div class="task-filter-toolbar"><input id="taskSearch" value="${esc(q)}" placeholder="Pretraži zadatke..." oninput="renderTasks()"><select id="taskStatusFilter" onchange="renderTasks()"><option value="">Svi statusi</option>${statuses.map(([v,l])=>`<option value="${v}" ${status===v?'selected':''}>${l}</option>`).join('')}</select><select id="taskPriorityFilter" onchange="renderTasks()"><option value="">Svi prioriteti</option>${priorities.map(([v,l])=>`<option value="${v}" ${priority===v?'selected':''}>${l}</option>`).join('')}</select><select id="taskClientFilter" onchange="renderTasks()"><option value="">Svi klijenti</option>${clients.map(c=>`<option value="${esc(c.id||c.clientId||'')}" ${client===String(c.id||c.clientId||'')?'selected':''}>${esc(c.name||'')}</option>`).join('')}</select><select id="taskProjectFilter" onchange="renderTasks()"><option value="">Svi projekti</option>${projects.map(p=>`<option value="${esc(p.id||'')}" ${project===String(p.id||'')?'selected':''}>${esc(p.name||'')}</option>`).join('')}</select><input id="taskDueFilter" type="date" value="${esc(due)}" onchange="renderTasks()"></div>
      <div class="task-results-head"><strong>${rows.length} zadataka</strong>${rows.length!==all.length?'<button class="btn light tiny" onclick="clearTaskFilters()">Očisti filtere</button>':''}</div><div class="task-card-grid">${rows.length?rows.map(({task,index})=>taskCard(task,index)).join(''):'<div class="empty">Nema zadataka za odabrane filtere.</div>'}</div></div>`;
    ensureWorkspaceActions?.('tasks');
  };
  clearTaskFilters=function(){window.taskCurrentView='all';renderTasks()};
  function taskForm(index){
    const row=index===null?{}:taskRows()[index]||{};
    const clients=typeof getClients==='function'?getClients().filter(c=>!c.archived):[], projects=extGet('projects');
    openModal(index===null?'Novi zadatak':'Uredi zadatak',`<div class="form-grid two"><label class="field"><span>Naziv</span><input id="taName" value="${esc(row.name||'')}" autofocus></label><label class="field"><span>Rok</span><input id="taDue" type="date" value="${esc(row.due||'')}"></label><label class="field"><span>Status</span><select id="taStatus">${statuses.map(([v,l])=>`<option value="${v}" ${((row.status||'open')===v)?'selected':''}>${l}</option>`).join('')}</select></label><label class="field"><span>Prioritet</span><select id="taPriority">${priorities.map(([v,l])=>`<option value="${v}" ${(row.priority||'normal')===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field"><span>Klijent (opcionalno)</span>${clientChoices('taClient',row.client||'')}</label><label class="field"><span>Projekt (opcionalno)</span><input id="taProject" list="taProjectOptions" value="${esc(row.project||'')}" placeholder="Upišite ili odaberite projekt"><datalist id="taProjectOptions">${projects.map(p=>`<option value="${esc(p.name||'')}">${esc(p.status||'')}</option>`).join('')}</datalist></label><label class="field full"><span>Opis</span><textarea id="taDescription" rows="3" placeholder="Šta treba uraditi?">${esc(row.description||'')}</textarea></label><label class="field full"><span>Napomena</span><textarea id="taNote" rows="2">${esc(row.note||'')}</textarea></label></div>`,`<div class="modal-actions"><button class="btn light" onclick="closeModal()">Odustani</button><button class="btn accent" onclick="saveTask(${index===null?'null':index})">Sačuvaj zadatak</button></div>`);
  }
  addTask=function(index=null){taskForm(index)}; editTask=function(index){taskForm(index)};
  saveTask=function(index=null){
    const name=$('taName')?.value.trim();if(!name){toast('Unesite naziv zadatka.');return}
    const rows=taskRows(), current=index===null?{}:rows[index]||{}, clients=typeof getClients==='function'?getClients():[], projects=extGet('projects'), clientName=$('taClient')?.value.trim()||'', projectName=$('taProject')?.value.trim()||'', client=clients.find(c=>String(c.name||'').toLowerCase()===clientName.toLowerCase()), project=projects.find(p=>String(p.name||'').toLowerCase()===projectName.toLowerCase()), status=$('taStatus')?.value||'open';
    const row={...current,id:current.id||`task-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name,description:$('taDescription')?.value.trim()||'',due:$('taDue')?.value||'',priority:$('taPriority')?.value||'normal',status,done:status==='done',note:$('taNote')?.value.trim()||'',clientId:client?.id||client?.clientId||current.clientId||'',client:client?.name||clientName,projectId:project?.id||current.projectId||'',project:project?.name||projectName,createdAt:current.createdAt||Date.now(),updatedAt:Date.now()};
    if(index===null)rows.push(row);else rows[index]=row;persist(rows);closeModal();renderTasks();toast(index===null?'Zadatak je kreiran.':'Zadatak je ažuriran.');
  };
  toggleTaskStatus=function(index,status){const rows=taskRows(),row=rows[index];if(!row)return;const next=status||((row.status==='done')?'open':'done');const apply=()=>{row.status=next;row.done=next==='done';row.updatedAt=Date.now();persist(rows);renderTasks();toast(`Zadatak je označen kao ${label(statuses,next).toLowerCase()}.`)};if(next==='done')confirmAction(`Označiti zadatak „${row.name}” kao završen?`,apply);else apply()};
  toggleTask=function(index){toggleTaskStatus(index)};
  deleteTask=function(index){const row=taskRows()[index];if(!row)return;confirmDestructive('Obrisati zadatak?',`Brišete zadatak „${row.name||'bez naziva'}“${row.due?` s rokom ${formatDate(row.due)}`:''}. Povezani klijent, projekt i ostali zapisi ostaju sačuvani.`,()=>{const rows=taskRows();rows.splice(index,1);persist(rows);closeModal();renderTasks();toast('Zadatak je obrisan.')})};
  taskDetail=function(index){const row=taskRows()[index];if(!row)return;openModal('Pregled zadatka',`<div class="task-detail"><h3>${esc(row.name||'Bez naziva')}</h3><div class="task-detail-grid"><div><span>Status</span><strong>${esc(label(statuses,row.status))}</strong></div><div><span>Prioritet</span><strong>${esc(label(priorities,row.priority))}</strong></div><div><span>Rok</span><strong class="${overdue(row)?'is-overdue':''}">${esc(dateText(row.due))}</strong></div><div><span>Klijent</span><strong>${esc(row.client||'—')}</strong></div><div><span>Projekt</span><strong>${esc(row.project||'—')}</strong></div></div>${row.description?`<p>${esc(row.description)}</p>`:''}${row.note?`<p class="task-note">${esc(row.note)}</p>`:''}</div>`,`<div class="modal-actions"><button class="btn light" onclick="closeModal()">Zatvori</button><button class="btn accent" onclick="closeModal();editTask(${index})">Uredi</button></div>`)};
  const baseCalendarEvents=calendarEvents;
  calendarEvents=function(){const taskEvents=taskRows().filter(t=>t.due).map(t=>({date:t.due,title:`Zadatak · ${t.name}`,type:'task',entity:'task',id:t.id,detail:[t.client,t.project].filter(Boolean).join(' · ')}));return [...baseCalendarEvents().filter(e=>e.entity!=='task'),...taskEvents]};
  const baseOpenCalendarEvent=openCalendarEvent;
  openCalendarEvent=function(entity,id){if(entity==='task'){const index=taskRows().findIndex(t=>String(t.id)===String(id));if(index>=0){taskDetail(index);return}}baseOpenCalendarEvent(entity,id)};
  const baseInlineBulkActions=inlineBulkActions;
  inlineBulkActions=function(route){if(route==='tasks')return `<button class="btn success small" onclick="applyInlineTaskStatusBulk('done')">Završeno</button><button class="btn light small" onclick="applyInlineTaskStatusBulk('in_progress')">U toku</button><button class="btn light small" onclick="applyInlineTaskStatusBulk('open')">Otvoreno</button>`;return baseInlineBulkActions(route)};
  applyInlineTaskStatusBulk=function(status){const keys=[...document.querySelectorAll('.inline-bulk-check:checked')].map(x=>x.value);if(!keys.length){toast('Označite barem jedan zadatak.');return}const rows=taskRows();rows.forEach((r,i)=>{if(keys.includes(String(i))){r.status=status;r.done=status==='done';r.updatedAt=Date.now()}});persist(rows);closeInlineBulk();renderTasks();toast('Status odabranih zadataka je ažuriran.')};
  routes.tasks=renderTasks;
  window.addEventListener('load',()=>{if(typeof renderTasks==='function'&&location.hash==='#tasks')renderTasks()});
})();
