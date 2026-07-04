import { el, fmtK } from "../util.js";
import { state } from "../state.js";

// ── TABLE ──────────────────────────────────────────────────────────────────
export function renderTable(projs,gl) {
  const proj=projs[state.activeScIdx], thead=el("tblHead"), tbody=el("detailTbody");
  if (!thead||!tbody||!proj||!proj.rows||!proj.rows.length) return;
  const rows=proj.rows, retIdx=proj.retYear-gl.baseYear;
  let hdr='<th class="tbl-lbl-hd">Metric</th>';
  rows.forEach((row,i)=>{ const cls=i>=retIdx?"tbl-yr-ret":"tbl-yr-acc"; hdr+='<th class="'+cls+'">'+row.yr+'<br><span style="opacity:.5;font-weight:400">'+row.age+'</span></th>'; });
  thead.innerHTML=hdr;
  const money=(v,cls,pre)=>(!v&&v!==0)||v===0?'<td class="dim tbl-v">\u2014</td>':'<td class="'+cls+' tbl-v">'+(pre||'')+fmtK(Math.abs(v))+'</td>';
  const pct=v=>'<td class="dim tbl-v">'+v+'%</td>';
  const ROWS=[
    ['Net Worth',         (r,i)=>money(proj.values[i],'hi','')],
    ['  Cash',            (r,i)=>money(r.cashVal,'','')],
    ['  Stocks',          (r,i)=>money(Math.round((proj.values[i]-r.cashVal)*proj.allocations[i]/100),'','')],
    ['  Bonds',           (r,i)=>money((proj.values[i]-r.cashVal)-Math.round((proj.values[i]-r.cashVal)*proj.allocations[i]/100),'','')],
    ['  Stock %',         (r,i)=>pct(proj.allocations[i])],
    ['Income',            (r,i)=>money(r.income,'pos','+')],
    ['Windfall',          (r,i)=>money(r.windfall,'pos','+')],
    ['Spending',          (r,i)=>money(r.spending,'neg','-')],
    ['Child Costs',       (r,i)=>money(r.childCost>0?r.childCost:null,'neg','-')],
    ['Net Flow',          (r,i)=>money(r.netFlow,r.netFlow>=0?'pos':'neg',r.netFlow>0?'+':r.netFlow<0?'-':'')],
    ['Market Return',     (r,i)=>money(r.portReturn,'pos','+')],
    ['Pension',           (r,i)=>money(r.pension,'pos','+')],
    ['Partner Pension',   (r,i)=>money(r.partnerPension>0?r.partnerPension:null,'pos','+')],
    ['Withdrawal',        (r,i)=>money(r.withdrawal,'neg','-')],
    ['Capital Gain Tax',  (r,i)=>money(r.taxPaid>0?r.taxPaid:0,'neg','-')],
    ['Mortgage',          (r,i)=>money(r.mortgagePayment>0?r.mortgagePayment:null,'neg','-')],
    ['Rent Saved',        (r,i)=>money(r.rentSavings>0?r.rentSavings:null,'pos','+')],
    ['Purchase Cost',     (r,i)=>money(r.extraCost>0?r.extraCost:null,'neg','-')],
  ];
  let body='';
  ROWS.forEach(([label,fn])=>{
    body+='<tr><td class="tbl-lbl">'+label+'</td>';
    rows.forEach((row,i)=>{ body+=fn(row,i); });
    body+='</tr>';
  });
  tbody.innerHTML=body;
}

// ── CSV DOWNLOAD ───────────────────────────────────────────────────────────
export function downloadCSV() {
  if (!state.lastProjs||!state.lastGl) return;
  const proj=state.lastProjs[state.activeScIdx],gl=state.lastGl;
  if (!proj||!proj.rows||!proj.rows.length) return;
  const rows=proj.rows;
  const METRICS=['Net Worth','Stocks','Bonds','Income','Windfall','Spending','Child Costs','Net Flow','Market Return','Pension','Withdrawal','Capital Gain Tax'];
  const getData=(mi,row,i)=>{
    const v=proj.values[i],alloc=proj.allocations[i];
    switch(mi){
      case 0:return v; case 1:return Math.round((v-(row.cashVal||0))*alloc/100); case 2:{const inv=v-(row.cashVal||0);return inv-Math.round(inv*alloc/100);}
      case 3:return row.income||0; case 4:return row.windfall||0; case 5:return row.spending?-row.spending:0;
      case 6:return row.childCost||0; case 7:return row.netFlow||0; case 8:return row.portReturn||0;
      case 9:return row.pension||0; case 10:return row.withdrawal?-row.withdrawal:0; case 11:return row.taxPaid>0?-row.taxPaid:0;
    } return '';
  };
  let csv='Metric,'+rows.map(r=>r.yr).join(',')+'\nAge,'+rows.map(r=>r.age).join(',')+'\n';
  METRICS.forEach((label,mi)=>{
    csv+=label+','+rows.map((row,i)=>{ const v=getData(mi,row,i); return typeof v==='string'?v:(v||0); }).join(',')+'\n';
  });
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download='fire_'+String.fromCharCode(65+state.activeScIdx)+'.csv'; a.click(); URL.revokeObjectURL(url);
}
