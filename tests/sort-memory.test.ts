import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleOf,rememberedCategory,relevantExamples} from '../src/lib/sort-memory';
import type {Transaction} from '../src/lib/types';

const rent = {id:'rent',account_id:'a',entity:'me',currency:'AUD',raw_description:'Example real estate Rent',merchant:'Example',amount_cents:-12300,category_id:'living',kind:'spend'} as Transaction;
test('confirmed repeats match account, direction and currency; conflicting history does not silently win', () => {
  const history=[exampleOf(rent)];
  assert.equal(rememberedCategory({...rent,id:'next'},history),'living');
  assert.equal(rememberedCategory({...rent,account_id:'b'},history),null);
  assert.equal(rememberedCategory({...rent,amount_cents:12300},history),null);
  assert.equal(rememberedCategory({...rent,currency:'USD'},history),null);
  assert.equal(rememberedCategory(rent,[...history,exampleOf({...rent,category_id:'work'})]),null);
});
test('merchant-relevant older history survives unrelated newer examples and varied bank descriptions', () => {
  const history=Array.from({length:70},(_,i)=>exampleOf({...rent,raw_description:`Other shop ${i}`,merchant:`Shop ${i}`,category_id:'food'}));
  history.push(exampleOf(rent));
  const chosen=relevantExamples({...rent,raw_description:'Example real estate Bank App Rent'},history);
  assert.equal(chosen[0].merchant,'Example');
  assert.equal(chosen.length,8);
});
test('confirmed financial movements retain their classification in memory',()=>{
  assert.equal(exampleOf({...rent,kind:'transfer',category_id:'unsorted'}).category,'__transfer');
  assert.equal(exampleOf({...rent,kind:'debt',category_id:'loan'}).category,'__debt');
});
