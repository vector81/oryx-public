import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticCategory,automaticChanges,cleanBankText} from '../src/lib/jev-policy';
test('Autonomous sorting applies all valid probabilities without inflating scores',()=>{
 for(const category of ['subscriptions','people','income','work','__transfer','__debt']) {
  assert.equal(automaticCategory(category,0.70001),true);
  assert.equal(automaticCategory(category,1),true);
  assert.equal(automaticCategory(category,0.7),true);
  assert.equal(automaticCategory(category,0.25),true);
  assert.equal(automaticCategory(category,0),true);
 }
 for(const probability of [NaN,Infinity,-1,1.01])assert.equal(automaticCategory('food',probability),false);
 assert.equal(automaticCategory('unsorted',1),false);
 assert.equal(automaticCategory('',1),false);
});
test('Automatic decisions use the same transfer and debt mapping as manual approval',()=>{
 assert.deepEqual(automaticChanges('__transfer','spend'),{category:'unsorted',kind:'transfer'});
 assert.deepEqual(automaticChanges('__debt','income'),{category:'loan',kind:'debt'});
 assert.deepEqual(automaticChanges('people','income'),{category:'people',kind:'income'});
});
test('Model input hides contact and bank reference data',()=>{
 const text=cleanBankText('Shop xx1234 1234567890 test@example.com');
 assert.ok(!text.includes('1234'));
 assert.ok(!text.includes('test@example.com'));
});
