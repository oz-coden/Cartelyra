import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {ThemeManager} from '../.checks/ui/ThemeManager.js';

function setup(values={},systemDark=false,writeBlocked=false){
  const {document,window}=parseHTML('<html><body><button id="btn-theme-toggle"></button></body></html>');
  globalThis.document=document;globalThis.window=window;
  window.matchMedia=()=>({matches:systemDark});
  const saved=new Map(Object.entries(values));
  globalThis.localStorage={
    getItem:key=>saved.get(key)??null,
    setItem:(key,value)=>{if(writeBlocked)throw new Error('Storage write blocked');saved.set(key,value);},
  };
  return {saved,document,theme:new ThemeManager()};
}

test('legacy theme preferences migrate once and subsequent visits use the Cartelyra preference',()=>{
  try{
    const {theme,saved,document}=setup({uniview_theme:'dark'});
    assert.equal(theme.getIsDark(),true);
    assert.ok(document.body.classList.contains('theme-dark'));
    assert.equal(document.documentElement.dataset.theme,'dark');
    assert.equal(document.getElementById('btn-theme-toggle').getAttribute('aria-label'),'ライトテーマに切り替え');
    assert.equal(saved.get('cartelyra_theme'),'dark');
    theme.toggleTheme();
    assert.equal(saved.get('cartelyra_theme'),'light');
    assert.equal(document.documentElement.dataset.theme,'light');
    assert.equal(document.getElementById('btn-theme-toggle').getAttribute('aria-label'),'ダークテーマに切り替え');
    assert.equal(saved.get('uniview_theme'),'dark');
    const reloaded=setup(Object.fromEntries(saved),true);
    assert.equal(reloaded.theme.getIsDark(),false);
  }finally{delete globalThis.localStorage;}
});

test('a valid Cartelyra preference takes priority over the legacy preference and system theme',()=>{
  try{
    const {theme,saved}=setup({cartelyra_theme:'light',uniview_theme:'dark'},true);
    assert.equal(theme.getIsDark(),false);
    assert.equal(saved.get('cartelyra_theme'),'light');
    theme.toggleTheme();
    assert.equal(saved.get('cartelyra_theme'),'dark');
  }finally{delete globalThis.localStorage;}
});

test('invalid preferences fall back to a valid legacy preference or the system theme',()=>{
  try{
    let env=setup({cartelyra_theme:'invalid',uniview_theme:'light'},true);
    assert.equal(env.theme.getIsDark(),false);
    assert.equal(env.saved.get('cartelyra_theme'),'light');
    env=setup({cartelyra_theme:'invalid',uniview_theme:'invalid'},true);
    assert.equal(env.theme.getIsDark(),true);
  }finally{delete globalThis.localStorage;}
});

test('a blocked migration write still applies the saved theme and permits in-memory theme changes',()=>{
  try{
    const {theme,saved,document}=setup({uniview_theme:'light'},true,true);
    assert.equal(theme.getIsDark(),false);
    assert.equal(saved.has('cartelyra_theme'),false);
    theme.toggleTheme();
    assert.equal(theme.getIsDark(),true);
    assert.ok(document.body.classList.contains('theme-dark'));
  }finally{delete globalThis.localStorage;}
});
