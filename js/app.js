const cfg=window.APP_CONFIG;
const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
let user=null, household=null, members=[], categories=[], channel=null, householdRole=null;
const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat(cfg.locale,{style:"currency",currency:cfg.currency}).format(Number(v||0));
function localDateParts(date = new Date()) {
  return {
    year: date.getFullYear(),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    day: String(date.getDate()).padStart(2, "0")
  };
}

const today = () => {
  const { year, month, day } = localDateParts();
  return `${year}-${month}-${day}`;
};

const monthKey = () => {
  const { year, month } = localDateParts();
  return `${year}-${month}`;
};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const show=(id,on=true)=>$(id).classList.toggle("hidden",!on);
function bounds(m) {
  const [year, month] = m.split("-").map(Number);

  const lastDay = new Date(year, month, 0).getDate();

  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  };
}
const CHART_COLORS=["#1f6b4f","#b98c4a","#4e7c97","#9a6c82","#6f8d5a","#c16e4b","#7a72a8","#4b8b86","#b46f73","#8b745d"];
function activatePage(name,remember=true){
  const target=document.querySelector(`.tabs button[data-page="${name}"]`);
  if(!target) name="dashboard";
  document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("active",x.dataset.page===name));
  document.querySelectorAll(".page").forEach(x=>x.classList.toggle("active",x.id===`page-${name}`));
  if(remember) localStorage.setItem("hfActivePage",name);
}

async function boot(){
  ["dashboardMonth","expenseMonth","incomeMonth"].forEach(id=>$(id).value=monthKey());
  $("expenseDate").value=$("incomeDate").value=today();
  $("recurringNextDue").value=today();
  const now=new Date();
  $("reportFrom").value=`${now.getFullYear()}-01-01`;
  $("reportTo").value=today();
  bind();
  const {data:{session}}=await client.auth.getSession();
  user=session?.user||null;
  user?await loadApp():renderAuth();
  client.auth.onAuthStateChange(async(_e,s)=>{user=s?.user||null;user?await loadApp():renderAuth();});
}
function renderAuth(){show("authView");show("appView",false);show("logoutBtn",false);}
async function loadApp(){
  show("authView",false);show("appView");show("logoutBtn");
  const {data,error}=await client.from("household_members").select("household_id,role,households(id,name,monthly_budget)").eq("user_id",user.id).maybeSingle();
  if(error)return alert(error.message);
  if(!data){household=null;show("householdSetup");show("mainApp",false);return;}
  household=data.households;householdRole=data.role;show("householdSetup",false);show("mainApp");
  $("householdName").textContent=household.name;await renderHouseholdSecurity();
  $("budgetAmount").value=household.monthly_budget||0;$("budgetDisplay").textContent=money(household.monthly_budget||0);
  await Promise.all([loadMembers(),loadCategories()]);activatePage(localStorage.getItem("hfActivePage")||"dashboard",false);await renderAll();subscribe();
}

async function renderHouseholdSecurity(){
  const owner=householdRole==="owner";
  show("refreshInviteBtn",owner);
  $("budgetAmount").disabled=!owner;
  const saveBtn=$("budgetForm").querySelector("button");
  saveBtn.disabled=!owner;
  saveBtn.title=owner?"":"Only the household owner can change the monthly budget.";
  if(!owner){$("householdInvite").textContent="Owner only";$("inviteExpiry").textContent="—";return;}
  const {data,error}=await client.rpc("get_household_invite",{p_household_id:household.id});
  if(error){$("householdInvite").textContent="Unavailable";$("inviteExpiry").textContent="—";return;}
  const invite=Array.isArray(data)?data[0]:data;
  $("householdInvite").textContent=invite?.invite_code||"—";
  $("inviteExpiry").textContent=invite?.invite_expires_at?new Date(invite.invite_expires_at).toLocaleString(cfg.locale):"—";
}
async function reloadHousehold(){
  const {data,error}=await client.from("household_members").select("role,households(id,name,monthly_budget)").eq("user_id",user.id).maybeSingle();
  if(error)return alert(error.message);
  if(data){householdRole=data.role;household=data.households;await renderHouseholdSecurity();$("budgetAmount").value=household.monthly_budget||0;$("budgetDisplay").textContent=money(household.monthly_budget||0);}
}

async function loadMembers(){
  const {data,error}=await client.rpc("get_household_members",{p_household_id:household.id});
  if(error){
    console.error("Could not load household members",error);
    alert(`Could not load household members: ${error.message}`);
    members=[];
  }else{
    members=data||[];
  }

  const opts=members.map(m=>{
    const label=m.display_name||m.email||"Household member";
    return `<option value="${m.user_id}">${esc(label)}</option>`;
  }).join("");

  for(const id of ["expensePaidBy","incomeReceivedBy","recurringPaidBy"]){
    const el=$(id);
    if(!el) continue;
    el.innerHTML=opts||'<option value="">No household members found</option>';
    el.disabled=!members.length;
    if(members.some(m=>m.user_id===user.id)) el.value=user.id;
  }

  $("memberList").innerHTML=members.length
    ? members.map(m=>`<div class="row"><div><strong>${esc(m.display_name||m.email||"Household member")}</strong><span>${esc(m.role)}</span></div></div>`).join("")
    : '<p class="muted">No household members found.</p>';
}
async function loadCategories(){
  const {data}=await client.from("categories").select("*").eq("household_id",household.id).order("name");
  categories=data||[];
  const opts=categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  $("expenseCategory").innerHTML=$("recurringCategory").innerHTML=opts;$("shoppingCategory").innerHTML=`<option value="">General</option>${opts}`;
  $("categoryList").innerHTML=categories.map(c=>`<div class="row"><strong>${esc(c.name)}</strong><button class="danger small" data-delcat="${c.id}">Delete</button></div>`).join("");
}
async function renderAll(){await Promise.all([renderDashboard(),renderExpenses(),renderIncome(),renderShopping(),renderRecurring(),renderReports()]);}
async function renderDashboard(){
  const {start,end}=bounds($("dashboardMonth").value);
  const [{data:i},{data:e}]=await Promise.all([
    client.from("income").select("*").eq("household_id",household.id).gte("date",start).lte("date",end),
    client.from("expenses").select("*,categories(name)").eq("household_id",household.id).gte("date",start).lte("date",end)
  ]);
  const inc=(i||[]).reduce((a,x)=>a+Number(x.amount),0), exp=(e||[]).reduce((a,x)=>a+Number(x.amount),0), saved=inc-exp;
  $("sumIncome").textContent=money(inc);$("sumExpenses").textContent=money(exp);$("sumSaved").textContent=money(saved);$("sumRate").textContent=`${(inc?saved/inc*100:0).toFixed(1)}%`;
  const by={};(e||[]).forEach(x=>{const n=x.categories?.name||"Other";by[n]=(by[n]||0)+Number(x.amount)});
  const categoryEntries=Object.entries(by).sort((a,b)=>b[1]-a[1]);
  $("categorySummary").innerHTML=categoryEntries.map(([n,v])=>`<div class="kv"><span>${esc(n)}</span><strong>${money(v)}</strong></div>`).join("")||'<p class="muted">No expenses this month.</p>';
  renderIncomeExpenseChart(inc,exp,saved);
  renderCategoryChart(categoryEntries,exp);
  const activity=[...(i||[]).map(x=>({d:x.date,l:x.source,a:Number(x.amount),t:"Income"})),...(e||[]).map(x=>({d:x.date,l:x.description,a:-Number(x.amount),t:"Expense"}))].sort((a,b)=>b.d.localeCompare(a.d)).slice(0,8);
  $("recentActivity").innerHTML=activity.map(x=>`<div class="row"><div><strong>${esc(x.l)}</strong><span>${x.d} · ${x.t}</span></div><strong class="${x.a<0?"negative":"positive"}">${x.a<0?"-":""}${money(Math.abs(x.a))}</strong></div>`).join("")||'<p class="muted">No activity yet.</p>';
}
function renderIncomeExpenseChart(income,expenses,saved){
  const max=Math.max(income,expenses,1);
  const incomePct=Math.max(0,Math.min(100,income/max*100));
  const expensePct=Math.max(0,Math.min(100,expenses/max*100));
  $("incomeExpenseChart").innerHTML=`
    <div class="compare-row income"><div class="compare-meta"><span class="compare-label">Income</span><strong class="compare-value">${money(income)}</strong></div><div class="compare-track"><div class="compare-fill" style="width:${incomePct.toFixed(1)}%"></div></div></div>
    <div class="compare-row expenses"><div class="compare-meta"><span class="compare-label">Expenses</span><strong class="compare-value">${money(expenses)}</strong></div><div class="compare-track"><div class="compare-fill" style="width:${expensePct.toFixed(1)}%"></div></div></div>
    <div class="comparison-footer"><span>Net for month</span><strong class="${saved<0?"negative":"positive"}">${saved<0?"-":""}${money(Math.abs(saved))}</strong></div>`;
}
function renderCategoryChart(entries,total){
  $("donutTotal").textContent=money(total);
  if(!entries.length||total<=0){
    $("categoryDonut").style.background="#edf2ef";
    $("categoryLegend").innerHTML='<div class="chart-empty">No category spending yet.</div>';
    return;
  }
  let cursor=0;
  const stops=[];
  $("categoryLegend").innerHTML=entries.map(([name,value],idx)=>{
    const pct=value/total*100;
    const color=CHART_COLORS[idx%CHART_COLORS.length];
    const start=cursor;cursor+=pct;
    stops.push(`${color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`);
    return `<div class="legend-row"><span class="legend-dot" style="--legend-color:${color}"></span><span class="legend-name">${esc(name)}</span><span class="legend-percent">${pct.toFixed(1)}%</span></div>`;
  }).join("");
  $("categoryDonut").style.background=`conic-gradient(${stops.join(",")})`;
}

async function renderExpenses(){
  const {start,end}=bounds($("expenseMonth").value);
  const { data, error } = await client
  .from("expenses")
  .select("*,categories(name)")
  .eq("household_id", household.id)
  .gte("date", start)
  .lte("date", end)
  .order("date", { ascending: false });

if (error) {
  console.error("Expense load failed:", error);
  alert(`Could not load expenses: ${error.message}`);
  return;
}
  $("expenseList").innerHTML=(data||[]).map(x=>`<div class="row"><div><strong>${esc(x.description)}</strong><span>${x.date} · ${esc(x.categories?.name||"Other")}${x.receipt_path?' · Receipt attached':''}</span></div><div class="row-actions"><strong>${money(x.amount)}</strong>${x.receipt_path?`<button class="small secondary" data-viewreceipt="${esc(x.receipt_path)}">Receipt</button>`:''}<button class="small" data-editexp='${JSON.stringify(x).replace(/'/g,"&#39;")}'>Edit</button><button class="danger small" data-delexp="${x.id}" data-receipt="${esc(x.receipt_path||'')}">Delete</button></div></div>`).join("")||'<p class="muted">No expenses this month.</p>';
}
async function renderIncome(){
  const {start,end}=bounds($("incomeMonth").value);
  const {data}=await client.from("income").select("*").eq("household_id",household.id).gte("date",start).lte("date",end).order("date",{ascending:false});
  $("incomeList").innerHTML=(data||[]).map(x=>`<div class="row"><div><strong>${esc(x.source)}</strong><span>${x.date}</span></div><div class="row-actions"><strong>${money(x.amount)}</strong><button class="small" data-editinc='${JSON.stringify(x).replace(/'/g,"&#39;")}'>Edit</button><button class="danger small" data-delinc="${x.id}">Delete</button></div></div>`).join("")||'<p class="muted">No income this month.</p>';
}
async function renderShopping(){
  const {data}=await client.from("shopping_items").select("*,categories(name)").eq("household_id",household.id).order("completed").order("created_at",{ascending:false});
  $("shoppingList").innerHTML=(data||[]).map(x=>`<div class="shopping-row ${x.completed?"done":""}"><input type="checkbox" data-toggle="${x.id}" ${x.completed?"checked":""}><div><strong>${esc(x.item)}</strong><span>${esc(x.quantity||"")} · ${esc(x.categories?.name||"General")}</span></div><button class="danger small" data-delshop="${x.id}">Delete</button></div>`).join("")||'<p class="muted">Shopping list is empty.</p>';
}

async function uploadReceipt(expenseId,file,oldPath=null){
  if(!file) return oldPath||null;
  const allowed=["image/jpeg","image/png","image/webp","application/pdf"];
  if(!allowed.includes(file.type)) throw new Error("Receipt must be JPG, PNG, WebP or PDF.");
  if(file.size>5*1024*1024) throw new Error("Receipt must be 5 MB or smaller.");
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const path=`${household.id}/${expenseId}/${Date.now()}-${safeName}`;
  const {error}=await client.storage.from("receipts").upload(path,file,{upsert:false,contentType:file.type});
  if(error) throw error;
  if(oldPath) await client.storage.from("receipts").remove([oldPath]);
  const {error:updateError}=await client.from("expenses").update({receipt_path:path,updated_by:user.id}).eq("id",expenseId);
  if(updateError){await client.storage.from("receipts").remove([path]);throw updateError;}
  return path;
}
async function openReceipt(path){
  const {data,error}=await client.storage.from("receipts").createSignedUrl(path,120);
  if(error)return alert(error.message);
  window.open(data.signedUrl,"_blank","noopener");
}
function resetExpenseForm(){
  $("expenseForm").reset();$("expenseId").value="";$("expenseDate").value=today();show("expenseCancel",false);show("currentReceipt",false);$("currentReceipt").textContent="";
}
function resetRecurringForm(){
  $("recurringForm").reset();$("recurringId").value="";$("recurringNextDue").value=today();$("recurringActive").checked=true;show("recurringCancel",false);
}
async function renderRecurring(){
  if(!household)return;
  const {data,error}=await client.from("recurring_bills").select("*,categories(name)").eq("household_id",household.id).order("active",{ascending:false}).order("next_due_date");
  if(error){$("recurringList").innerHTML='<p class="muted">Run the V8 Supabase migration to enable recurring bills.</p>';return;}
  $("recurringList").innerHTML=(data||[]).map(b=>{
    const overdue=b.active&&b.next_due_date<today();
    return `<div class="row recurring-row ${b.active?'':'inactive'}"><div><strong>${esc(b.description)}</strong><span>${esc(b.frequency)} · next ${b.next_due_date} · ${esc(b.categories?.name||"Other")}${overdue?' · OVERDUE':''}${b.active?'':' · inactive'}</span></div><div class="row-actions"><strong>${money(b.amount)}</strong>${b.active?`<button class="small pay-bill" data-paybill="${b.id}">Mark paid</button>`:''}<button class="small" data-editbill='${JSON.stringify(b).replace(/'/g,"&#39;")}'>Edit</button><button class="danger small" data-delbill="${b.id}">Delete</button></div></div>`;
  }).join("")||'<p class="muted">No recurring bills yet.</p>';
}
function monthLabel(key){const [y,m]=key.split('-').map(Number);return new Intl.DateTimeFormat(cfg.locale,{month:'short',year:'numeric'}).format(new Date(y,m-1,1));}
async function renderReports(){
  if(!household||!$("reportFrom")||!$("reportTo"))return;
  const from=$("reportFrom").value,to=$("reportTo").value;
  if(!from||!to||from>to)return;
  const [{data:i,error:ie},{data:e,error:ee}]=await Promise.all([
    client.from("income").select("*").eq("household_id",household.id).gte("date",from).lte("date",to),
    client.from("expenses").select("*,categories(name)").eq("household_id",household.id).gte("date",from).lte("date",to)
  ]);
  if(ie||ee)return;
  const inc=(i||[]).reduce((a,x)=>a+Number(x.amount),0),exp=(e||[]).reduce((a,x)=>a+Number(x.amount),0),saved=inc-exp;
  $("reportIncome").textContent=money(inc);$("reportExpenses").textContent=money(exp);$("reportSaved").textContent=money(saved);$("reportRate").textContent=`${(inc?saved/inc*100:0).toFixed(1)}%`;
  const months={};
  for(const x of i||[]){const k=x.date.slice(0,7);months[k]??={income:0,expenses:0};months[k].income+=Number(x.amount)}
  for(const x of e||[]){const k=x.date.slice(0,7);months[k]??={income:0,expenses:0};months[k].expenses+=Number(x.amount)}
  const mEntries=Object.entries(months).sort((a,b)=>a[0].localeCompare(b[0]));
  const max=Math.max(1,...mEntries.flatMap(([,v])=>[v.income,v.expenses]));
  $("reportMonthly").innerHTML=mEntries.map(([k,v])=>`<div class="report-month"><div class="report-month-head"><strong>${monthLabel(k)}</strong><span class="${v.income-v.expenses<0?'negative':'positive'}">${money(v.income-v.expenses)} net</span></div><div class="mini-bar"><span>Income</span><div><i class="income-bar" style="width:${(v.income/max*100).toFixed(1)}%"></i></div><strong>${money(v.income)}</strong></div><div class="mini-bar"><span>Expenses</span><div><i class="expense-bar" style="width:${(v.expenses/max*100).toFixed(1)}%"></i></div><strong>${money(v.expenses)}</strong></div></div>`).join('')||'<p class="muted">No transactions in this period.</p>';
  const by={};for(const x of e||[]){const n=x.categories?.name||'Other';by[n]=(by[n]||0)+Number(x.amount)}
  $("reportCategories").innerHTML=Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([n,v])=>`<div class="kv"><span>${esc(n)} <small>${exp?(v/exp*100).toFixed(1):'0.0'}%</small></span><strong>${money(v)}</strong></div>`).join('')||'<p class="muted">No expenses in this period.</p>';
}
function csvCell(v){const s=String(v??"");return `"${s.replace(/"/g,'""')}"`;}
function downloadFile(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportExpensesCsv(){
  const from=$("reportFrom").value,to=$("reportTo").value;
  const {data,error}=await client.from("expenses").select("*,categories(name),profiles!expenses_paid_by_fkey(display_name,email)").eq("household_id",household.id).gte("date",from).lte("date",to).order("date");
  if(error)return alert(error.message);
  const rows=[["Date","Description","Category","Amount","Paid by","Payment method","Notes","Receipt attached"],...(data||[]).map(x=>[x.date,x.description,x.categories?.name||"",x.amount,x.profiles?.display_name||x.profiles?.email||"",x.payment_method||"",x.notes||"",x.receipt_path?"Yes":"No"])];
  downloadFile(`expenses-${from}-to-${to}.csv`,rows.map(r=>r.map(csvCell).join(',')).join('\n'),'text/csv;charset=utf-8');
}
async function exportIncomeCsv(){
  const from=$("reportFrom").value,to=$("reportTo").value;
  const {data,error}=await client.from("income").select("*,profiles!income_received_by_fkey(display_name,email)").eq("household_id",household.id).gte("date",from).lte("date",to).order("date");
  if(error)return alert(error.message);
  const rows=[["Date","Source","Amount","Received by","Notes"],...(data||[]).map(x=>[x.date,x.source,x.amount,x.profiles?.display_name||x.profiles?.email||"",x.notes||""])];
  downloadFile(`income-${from}-to-${to}.csv`,rows.map(r=>r.map(csvCell).join(',')).join('\n'),'text/csv;charset=utf-8');
}
async function exportJson(){
  const [expenses,income,cats,shopping,bills]=await Promise.all([
    client.from("expenses").select("*").eq("household_id",household.id),client.from("income").select("*").eq("household_id",household.id),client.from("categories").select("*").eq("household_id",household.id),client.from("shopping_items").select("*").eq("household_id",household.id),client.from("recurring_bills").select("*").eq("household_id",household.id)
  ]);
  const firstError=[expenses,income,cats,shopping,bills].find(x=>x.error)?.error;if(firstError)return alert(firstError.message);
  const backup={exported_at:new Date().toISOString(),household:{id:household.id,name:household.name,monthly_budget:household.monthly_budget},categories:cats.data||[],expenses:expenses.data||[],income:income.data||[],shopping_items:shopping.data||[],recurring_bills:bills.data||[]};
  downloadFile(`household-finance-backup-${today()}.json`,JSON.stringify(backup,null,2),'application/json');
}
function subscribe(){
  if(channel)client.removeChannel(channel);
  channel=client.channel("home-"+household.id)
    .on("postgres_changes",{event:"*",schema:"public",table:"expenses",filter:`household_id=eq.${household.id}`},renderAll)
    .on("postgres_changes",{event:"*",schema:"public",table:"income",filter:`household_id=eq.${household.id}`},renderAll)
    .on("postgres_changes",{event:"*",schema:"public",table:"shopping_items",filter:`household_id=eq.${household.id}`},renderShopping)
    .on("postgres_changes",{event:"*",schema:"public",table:"recurring_bills",filter:`household_id=eq.${household.id}`},renderRecurring)
    .subscribe();
}
function bind(){
  document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>activatePage(b.dataset.page));
  $("authForm").onsubmit=async e=>{e.preventDefault();const{error}=await client.auth.signInWithPassword({email:$("authEmail").value,password:$("authPassword").value});$("authMessage").textContent=error?error.message:"Signed in."};
  $("signUpBtn").onclick=async()=>{const{error}=await client.auth.signUp({email:$("authEmail").value,password:$("authPassword").value});$("authMessage").textContent=error?error.message:"Account created. Check your email if confirmation is enabled."};
  $("logoutBtn").onclick=()=>client.auth.signOut();
  $("createHouseholdForm").onsubmit=async e=>{e.preventDefault();const{error}=await client.rpc("create_household",{p_name:$("newHouseholdName").value});error?alert(error.message):loadApp()};
  $("joinHouseholdForm").onsubmit=async e=>{e.preventDefault();const{error}=await client.rpc("join_household",{p_invite_code:$("inviteCode").value.trim().toUpperCase()});error?alert(error.message):loadApp()};
  $("expenseForm").onsubmit=async e=>{e.preventDefault();const id=$("expenseId").value||null,file=$("expenseReceipt").files?.[0]||null;const p={household_id:household.id,date:$("expenseDate").value,amount:Number($("expenseAmount").value),description:$("expenseDescription").value.trim(),category_id:$("expenseCategory").value||null,paid_by:$("expensePaidBy").value||user.id,payment_method:$("expensePaymentMethod").value,notes:$("expenseNotes").value.trim(),updated_by:user.id};let expenseId=id,oldPath=null;if(id){const{data:old,error:readError}=await client.from("expenses").select("receipt_path").eq("id",id).single();if(readError)return alert(readError.message);oldPath=old?.receipt_path||null;const{error}=await client.from("expenses").update(p).eq("id",id);if(error)return alert(error.message);}else{const{data,error}=await client.from("expenses").insert({...p,created_by:user.id}).select("id").single();if(error)return alert(error.message);expenseId=data.id;}try{if(file)await uploadReceipt(expenseId,file,oldPath);}catch(err){alert(`Expense saved, but receipt upload failed: ${err.message}`);}resetExpenseForm();await renderAll();};
  $("incomeForm").onsubmit=async e=>{e.preventDefault();const id=$("incomeId").value,p={household_id:household.id,date:$("incomeDate").value,amount:Number($("incomeAmount").value),source:$("incomeSource").value.trim(),received_by:$("incomeReceivedBy").value||user.id,notes:$("incomeNotes").value.trim(),updated_by:user.id};const q=id?client.from("income").update(p).eq("id",id):client.from("income").insert({...p,created_by:user.id});const{error}=await q;if(error)return alert(error.message);$("incomeForm").reset();$("incomeId").value="";$("incomeDate").value=today();show("incomeCancel",false);renderAll()};
  $("shoppingForm").onsubmit=async e=>{e.preventDefault();const{error}=await client.from("shopping_items").insert({household_id:household.id,item:$("shoppingItem").value.trim(),quantity:$("shoppingQty").value.trim(),category_id:$("shoppingCategory").value||null,added_by:user.id});if(error)return alert(error.message);$("shoppingItem").value="";$("shoppingQty").value="1"};
  $("recurringForm").onsubmit=async e=>{e.preventDefault();const id=$("recurringId").value||null,p={household_id:household.id,description:$("recurringDescription").value.trim(),amount:Number($("recurringAmount").value),category_id:$("recurringCategory").value||null,paid_by:$("recurringPaidBy").value||user.id,frequency:$("recurringFrequency").value,next_due_date:$("recurringNextDue").value,active:$("recurringActive").checked,notes:$("recurringNotes").value.trim(),updated_at:new Date().toISOString()};const q=id?client.from("recurring_bills").update(p).eq("id",id):client.from("recurring_bills").insert({...p,created_by:user.id});const{error}=await q;if(error)return alert(error.message);resetRecurringForm();await renderRecurring();};
  $("reportForm").onsubmit=async e=>{e.preventDefault();await renderReports();};
  $("exportExpensesBtn").onclick=exportExpensesCsv;
  $("exportIncomeBtn").onclick=exportIncomeCsv;
  $("exportJsonBtn").onclick=exportJson;

  $("categoryForm").onsubmit=async e=>{e.preventDefault();const{error}=await client.from("categories").insert({household_id:household.id,name:$("categoryName").value.trim(),created_by:user.id});if(error)return alert(error.message);$("categoryName").value="";await loadCategories();renderAll()};
  $("budgetForm").onsubmit=async e=>{e.preventDefault();if(householdRole!=="owner")return alert("Only the household owner can change the monthly budget.");const v=Number($("budgetAmount").value||0),{error}=await client.from("households").update({monthly_budget:v}).eq("id",household.id);if(error)return alert(error.message);household.monthly_budget=v;$("budgetDisplay").textContent=money(v)};
  $("refreshInviteBtn").onclick=async()=>{if(householdRole!=="owner")return;const {data,error}=await client.rpc("rotate_household_invite",{p_household_id:household.id});if(error)return alert(error.message);await reloadHousehold();alert("New invite code created. The previous code is no longer valid.");};
  ["dashboardMonth","expenseMonth","incomeMonth"].forEach(id=>$(id).onchange=id==="dashboardMonth"?renderDashboard:id==="expenseMonth"?renderExpenses:renderIncome);
  $("expenseCancel").onclick=resetExpenseForm;
  $("recurringCancel").onclick=resetRecurringForm;
  $("incomeCancel").onclick=()=>{$("incomeForm").reset();$("incomeId").value="";show("incomeCancel",false)};
  document.addEventListener("click",async e=>{
    const t=e.target;
    if(t.dataset.delexp&&confirm("Delete expense?")){
      const receipt=t.dataset.receipt||null;
      const {error}=await client.from("expenses").delete().eq("id",t.dataset.delexp);
      if(error)return alert(error.message);
      if(receipt)await client.storage.from("receipts").remove([receipt]);
      await Promise.all([renderExpenses(),renderDashboard(),renderReports()]);
    }
    if(t.dataset.delinc&&confirm("Delete income?")){
      const {error}=await client.from("income").delete().eq("id",t.dataset.delinc);
      if(error)return alert(error.message);
      await Promise.all([renderIncome(),renderDashboard()]);
    }
    if(t.dataset.delshop){
      const {error}=await client.from("shopping_items").delete().eq("id",t.dataset.delshop);
      if(error)return alert(error.message);
      await renderShopping();
    }
    if(t.dataset.toggle){
      const {error}=await client.from("shopping_items").update({completed:t.checked,completed_by:t.checked?user.id:null,completed_at:t.checked?new Date().toISOString():null}).eq("id",t.dataset.toggle);
      if(error){t.checked=!t.checked;return alert(error.message);}
      await renderShopping();
    }
    if(t.dataset.delcat&&confirm("Delete category?")){
      const{error}=await client.from("categories").delete().eq("id",t.dataset.delcat);
      if(error)alert("Category may be in use.");else{await loadCategories();await renderAll();}
    }
    if(t.dataset.viewreceipt) await openReceipt(t.dataset.viewreceipt);
    if(t.dataset.paybill){
      if(!confirm("Mark this bill as paid and add it to Expenses?"))return;
      const {error}=await client.rpc("pay_recurring_bill",{p_bill_id:t.dataset.paybill,p_payment_method:"Card"});
      if(error)return alert(error.message);
      await Promise.all([renderRecurring(),renderExpenses(),renderDashboard(),renderReports()]);
    }
    if(t.dataset.delbill&&confirm("Delete this recurring bill?")){
      const {error}=await client.from("recurring_bills").delete().eq("id",t.dataset.delbill);if(error)return alert(error.message);await renderRecurring();
    }
    if(t.dataset.editbill){
      const b=JSON.parse(t.dataset.editbill);$("recurringId").value=b.id;$("recurringDescription").value=b.description;$("recurringAmount").value=b.amount;$("recurringCategory").value=b.category_id||"";$("recurringPaidBy").value=b.paid_by||user.id;$("recurringFrequency").value=b.frequency;$("recurringNextDue").value=b.next_due_date;$("recurringNotes").value=b.notes||"";$("recurringActive").checked=b.active;show("recurringCancel");activatePage("more");
    }
    if(t.dataset.editexp){
      const x=JSON.parse(t.dataset.editexp);$("expenseId").value=x.id;$("expenseDate").value=x.date;$("expenseAmount").value=x.amount;$("expenseDescription").value=x.description;$("expenseCategory").value=x.category_id||"";$("expensePaidBy").value=x.paid_by||user.id;$("expensePaymentMethod").value=x.payment_method||"Card";$("expenseNotes").value=x.notes||"";show("expenseCancel");if(x.receipt_path){$("currentReceipt").innerHTML='<span>Current receipt attached.</span> <button type="button" class="small secondary" data-viewreceipt="'+esc(x.receipt_path)+'">View</button>';show("currentReceipt");}else{show("currentReceipt",false);}activatePage("expenses");
    }
    if(t.dataset.editinc){
      const x=JSON.parse(t.dataset.editinc);$("incomeId").value=x.id;$("incomeDate").value=x.date;$("incomeAmount").value=x.amount;$("incomeSource").value=x.source;$("incomeReceivedBy").value=x.received_by||user.id;$("incomeNotes").value=x.notes||"";show("incomeCancel");activatePage("income");
    }
  });
}
if("serviceWorker" in navigator){
  navigator.serviceWorker.register("service-worker.js?v=8",{updateViaCache:"none"})
    .then(reg=>reg.update())
    .catch(err=>console.warn("Service worker update failed",err));
}
boot();
