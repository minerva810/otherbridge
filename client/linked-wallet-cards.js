import React from 'react';
const h=React.createElement;
const shorten=value=>value.slice(0,6)+'…'+value.slice(-4);

export function LinkedWalletCards({rows,onLink}){
  return h('div',{className:'glyph-wallet-grid'},rows.map((row,index)=>{
    const linked=row.linked==='LINKED';const missing=row.linked==='NOT_LINKED';
    const status=linked?'Glyph linked':missing?'Not linked':'Linked status unverified';
    return h('article',{className:'glyph-wallet-card',key:row.address,'data-linked-status':row.linked},
      h('div',{className:'glyph-wallet-heading'},
        h('span',{className:'glyph-wallet-icon','aria-hidden':true},'◈'),
        h('div',null,h('h3',null,'Wallet '+String.fromCharCode(65+index)),h('span',{className:'glyph-wallet-address',title:row.address},shorten(row.address)))),
      h('div',{className:'glyph-state-line '+(linked?'is-done':missing?'is-missing':'is-unknown')},
        h('span',{'aria-hidden':true},linked?'✓':missing?'✕':'◌'),h('strong',null,status)),
      !linked&&h('div',{className:'glyph-wallet-next'},h('button',{type:'button',className:'btn '+(missing?'btn-primary':'btn-outline'),onClick:onLink},missing?'Connect to Glyph ↗':'Glyph에서 연결 지갑 확인 ↗')));
  }));
}
