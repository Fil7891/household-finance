const cfg=window.APP_CONFIG;
const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
let user=null, household=null, members=[], categories=[], channel=null;
const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat(cfg.locale,{style:"currency",currency:cfg.currency}).format(Number(v||0));
const today=()=>new Date().toISOString().slice(0,10);
const monthKey=()=>new Date().toISOString().slice(0,7);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const show=(id,on=true)=>$(id).classList.toggle("hidden",!on);
function bounds(m){const[y,mo]=m.split("-").map(Number);return{start:`${y}-${String(mo).padStart(2,"0")}-01`,end:new Date(y,mo,0).toISOString().slice(0,10)}}

async function boot(){
  ["dashboardMonth","expenseMonth","incomeMonth"].forEach(id=>$(id).value=monthKey());
  $("expenseDate").value=$("incomeDate").value=today();
  bind();
  const {data:{session}}=await client.auth.getSession();
  user=session?.user||null;
  user?await loadApp():renderAuth();
  client.auth.onAuthStateChange(async(_e,s)=>{user=s?.user||null;user?await loadApp():renderAuth();});
}
function renderAuth(){show("authView");show("appView",false);show("logoutBtn",false);}
async function loadApp(){
  show("authView",false);show("appView");show("logoutBtn");
  const {data,error}=await client.from("household_members").select("household_id,role,households(id,name,invite_code,monthly_budget)").eq("user_id",user.id).maybeSingle();
  if(error)return alert(error.message);
  if(!data){household=null;show("householdSetup");show("mainApp",false);return;}
  household=data.households;show("householdSetup",false);show("mainApp");
  $("householdName").textContent=household.name;$("householdInvite").textContent=household.invite_code;
  $("budgetAmount").value=household.monthly_budget||0;$("budgetDisplay").textContent=money(household.monthly_budget||0);
  await Promise.all([loadMembers(),loadCategories()]);await renderAll();subscribe();
}
async function loadMembers(){
  const {data}=await client.from("household_members").select("user_id,role,profiles(display_name,email)").eq("household_id",household.id);
  members=data||[];
  const opts=members.map(m=>`<option value="${m.user_id}">${esc(m.profiles?.display_name||m.profiles?.email||"Member")}</option>`).join("");
  $("expensePaidBy").innerHTML=$("incomeReceivedBy").innerHTML=opts;
  $("memberList").innerHTML=members.map(m=>`<div class="row"><div><strong>${esc(m.profiles?.display_name||m.profiles?.email)}</strong><span>${esc(m.role)}</span></div></div>`).join("");
}
async function loadCategories(){
  const {data}=await client.from("categories").select("*").eq("household_id",household.id).order("name");
  categories=data||[];
  const opts=categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  $("expenseCategory").innerHTML=opts;$("shoppingCategory").innerHTML=`<option value="">General</option>${opts}`;
  $("categoryList").innerHTML=categories.map(c=>`<div class="row"><strong>${esc(c.name)}</strong><button class="danger small" data-delcat="${c.id}">Delete</button></div>`).join("");
}
async function renderAll(){await Promise.all([renderDashboard(),renderExpenses(),renderIncome(),renderShopping()]);}
async function renderDashboard(){
  const {start,end}=bounds($("dashboardMonth").value);
  const [{data:i},{data:e}]=await Promise.all([
    client.from("income").select("*").eq("household_id",household.id).gte("date",start).lte("date",end),
    client.from("expenses").select("*,categories(name)").eq("household_id",household.id).gte("date",start).lte("date",end)
  ]);
  const inc=(i||[]).reduce((a,x)=>a+Number(x.amount),0), exp=(e||[]).reduce((a,x)=>a+Number(x.amount),0), saved=inc-exp;
  $("sumIncome").textContent=money(inc);$("sumExpenses").textContent=money(exp);$("sumSaved").textContent=money(saved);$("sumRate").textContent=`${(inc?saved/inc*100:0).toFixed(1)}%`;
  const by={};(e||[]).forEach(x=>{const n=x.categories?.name||"Other";by[n]=(by[n]||0)+Number(x.amount)});
  $("categorySummary").innerHTML=Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([n,v])=>`<div class="kv"><span>${esc(n)}</span><strong>${money(v)}</strong></div>`).join("")||'<p class="muted">No expenses this month.</p>';
  const activity=[...(i||[]).map(x=>({d:x.date,l:x.source,a:Number(x.amount),t:"Income"})),...(e||[]).map(x=>({d:x.date,l:x.description,a:-Number(x.amount),t:"Expense"}))].sort((a,b)=>b.d.localeCompare(a.d)).slice(0,8);
  $("recentActivity").innerHTML=activity.map(x=>`<div class="row"><div><strong>${esc(x.l)}</strong><span>${x.d} · ${x.t}</span></div><strong class="${x.a<0?"negative":"positive"}">${x.a<0?"-":""}${money(Math.abs(x.a))}</strong></div>`).join("")||'<p class="muted">No activity yet.</p>';
}
async function renderExpenses(){
  const {start,end}=bounds($("expenseMonth").value);
  const {data}=await client.from("expenses").select("*,categories(name)").eq("household_id",household.id).gte("date",start).lte("date",end).order("date",{ascending:false});
  $("expenseList").innerHTML=(data||[]).map(x=>`<div class="row"><div><strong>${esc(x.description)}</strong><span>${x.date} · ${esc(x.categories?.name||"Other")}</span></div><div class="row-actions"><strong>${money(x.amount)}</strong><button class="small" data-editexp='${JSON.stringify(x).replace(/'/g,"&#39;")}'>Edit</button><button class="danger small" data-delexp="${x.id}">Delete</button></div></div>`).join("")||'<p class="muted">No expenses this month.</p>';
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
function subscribe(){
  if(channel)client.removeChannel(channel);
  channel=client.channel("home-"+household.id)
    .on("postgres_changes",{event:"*",schema:"public",table:"expenses",filter:`household_id=eq.${household.id}`},renderAll)
    .on("postgres_changes",{event:"*",schema:"public",table:"income",filter:`household_id=eq.${household.id}`},renderAll)
    .on("postgres_changes",{event:"*",schema:"public",table:"shopping_items",filter:`household_id=eq.${household.id}`},renderShopping)
    .subscribe();
}
function bind(){
  document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));b.classList.add("active");$(`page-${b.dataset.page}`).classList.add("active");});
  $("authForm").onsubmit=async e=>{e.preventDefault();const{error}=await client.auth.signInWithPassword({email:$("authEmail").value,password:$("authPassword").value});$("authMessage").textContent=error?error.message:"Signed in."};
  $("signUpBtn").onclick=async()=>{const{error}=await client.auth.signUp({email:$("authEmail").value,password:$("authPassword").value});$("authMessage").textContent=error?error.message:"Account created. Check your email if confirmation is enabled."};
  $("logoutBtn").onclick=()=>client.auth.signOut();
  $("createHouseholdForm").onsubmit=async e=>{e.preventDefault();const{error}=await client.rpc("create_household",{p_name:$("newHouseholdName").value});error?alert(error.message):loadApp()};
  $("joinHouseholdForm").onsubmit=async e=>{e.preventDefault();const{error}=await client.rpc("join_household",{p_invite_code:$("inviteCode").value.trim().toUpperCase()});error?alert(error.message):loadApp()};
  $("expenseForm").onsubmit=async e=>{e.preventDefault();const id=$("expenseId").value,p={household_id:household.id,date:$("expenseDate").value,amount:Number($("expenseAmount").value),description:$("expenseDescription").value.trim(),category_id:$("expenseCategory").value||null,paid_by:$("expensePaidBy").value||user.id,payment_method:$("expensePaymentMethod").value,notes:$("expenseNotes").value.trim(),updated_by:user.id};const q=id?client.from("expenses").update(p).eq("id",id):client.from("expenses").insert({...p,created_by:user.id});const{error}=await q;if(error)return alert(error.message);$("expenseForm").reset();$("expenseId").value="";$("expenseDate").value=today();show("expenseCancel",false);renderAll()};
  $("incomeForm").onsubmit=async e=>{e.preventDefault();const id=$("incomeId").value,p={household_id:household.id,date:$("incomeDate").value,amount:Number($("incomeAmount").value),source:$("incomeSource").value.trim(),received_by:$("incomeReceivedBy").value||user.id,notes:$("incomeNotes").value.trim(),updated_by:user.id};const q=id?client.from("income").update(p).eq("id",id):client.from("income").insert({...p,created_by:user.id});const{error}=await q;if(error)return alert(error.message);$("incomeForm").reset();$("incomeId").value="";$("incomeDate").value=today();show("incomeCancel",false);renderAll()};
  $("shoppingForm").onsubmit=async e=>{e.preventDefault();const{error}=await client.from("shopping_items").insert({household_id:household.id,item:$("shoppingItem").value.trim(),quantity:$("shoppingQty").value.trim(),category_id:$("shoppingCategory").value||null,added_by:user.id});if(error)return alert(error.message);$("shoppingItem").value="";$("shoppingQty").value="1"};
  $("categoryForm").onsubmit=async e=>{e.preventDefault();const{error}=await client.from("categories").insert({household_id:household.id,name:$("categoryName").value.trim(),created_by:user.id});if(error)return alert(error.message);$("categoryName").value="";await loadCategories();renderAll()};
  $("budgetForm").onsubmit=async e=>{e.preventDefault();const v=Number($("budgetAmount").value||0),{error}=await client.from("households").update({monthly_budget:v}).eq("id",household.id);if(error)return alert(error.message);household.monthly_budget=v;$("budgetDisplay").textContent=money(v)};
  ["dashboardMonth","expenseMonth","incomeMonth"].forEach(id=>$(id).onchange=id==="dashboardMonth"?renderDashboard:id==="expenseMonth"?renderExpenses:renderIncome);
  $("expenseCancel").onclick=()=>{$("expenseForm").reset();$("expenseId").value="";show("expenseCancel",false)};
  $("incomeCancel").onclick=()=>{$("incomeForm").reset();$("incomeId").value="";show("incomeCancel",false)};
  document.addEventListener("click",async e=>{const t=e.target;if(t.dataset.delexp&&confirm("Delete expense?"))await client.from("expenses").delete().eq("id",t.dataset.delexp);if(t.dataset.delinc&&confirm("Delete income?"))await client.from("income").delete().eq("id",t.dataset.delinc);if(t.dataset.delshop)await client.from("shopping_items").delete().eq("id",t.dataset.delshop);if(t.dataset.toggle)await client.from("shopping_items").update({completed:t.checked,completed_by:t.checked?user.id:null,completed_at:t.checked?new Date().toISOString():null}).eq("id",t.dataset.toggle);if(t.dataset.delcat&&confirm("Delete category?")){const{error}=await client.from("categories").delete().eq("id",t.dataset.delcat);if(error)alert("Category may be in use.");else{await loadCategories();renderAll()}}if(t.dataset.editexp){const x=JSON.parse(t.dataset.editexp);$("expenseId").value=x.id;$("expenseDate").value=x.date;$("expenseAmount").value=x.amount;$("expenseDescription").value=x.description;$("expenseCategory").value=x.category_id||"";$("expensePaidBy").value=x.paid_by||user.id;$("expensePaymentMethod").value=x.payment_method||"Card";$("expenseNotes").value=x.notes||"";show("expenseCancel");document.querySelector('[data-page="expenses"]').click()}if(t.dataset.editinc){const x=JSON.parse(t.dataset.editinc);$("incomeId").value=x.id;$("incomeDate").value=x.date;$("incomeAmount").value=x.amount;$("incomeSource").value=x.source;$("incomeReceivedBy").value=x.received_by||user.id;$("incomeNotes").value=x.notes||"";show("incomeCancel");document.querySelector('[data-page="income"]').click()}});
}
if("serviceWorker" in navigator){
  navigator.serviceWorker.register("service-worker.js?v=3",{updateViaCache:"none"})
    .then(reg=>reg.update())
    .catch(err=>console.warn("Service worker update failed",err));
}
boot();
