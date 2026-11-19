import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('autonomous sorter: local database, mocked model, concurrency, corrections, retry and undo',()=>{
  execFileSync(process.execPath, ['--conditions=react-server','--import=tsx',fileURLToPath(new URL('./fixtures/ai-sort-integration.ts',import.meta.url))],{
    timeout:30000,stdio:'pipe',env:{...process.env,DATA_URL:'https://db.test',DATA_TOKEN:'test-only',TYPESAFE_API_KEY:'test-only'},
  });
});
