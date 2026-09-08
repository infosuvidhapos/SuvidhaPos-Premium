(function(w,d){
'use strict';
const KEY='suvidha_theme';
function current(){try{return localStorage.getItem(KEY)==='light'?'light':'dark'}catch{return 'dark'}}
function apply(v){
  v=v==='light'?'light':'dark';
  d.documentElement.dataset.theme=v;
  d.body.dataset.theme=v;
  try{localStorage.setItem(KEY,v)}catch{}
  d.querySelectorAll('[data-theme-toggle]').forEach(function(b){
    b.textContent=v==='dark'?'☀':'☾';
    b.title=v==='dark'?'Switch to Light theme':'Switch to Dark theme';
  });
  return v;
}
w.getSuvidhaTheme=current;
w.setSuvidhaTheme=apply;
w.toggleSuvidhaTheme=function(){return apply(current()==='dark'?'light':'dark')};
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',function(){apply(current())});else apply(current());
})(window,document);
