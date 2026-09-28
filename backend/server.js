import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const app = express();
const port = Number(process.env.PORT || 8787);
const origin = process.env.FRONTEND_ORIGIN || 'https://hersheyclaps.github.io';
app.use(cors({ origin }));
app.use(express.json());

const envName = process.env.PLAID_ENV || 'sandbox';
const basePath = PlaidEnvironments[envName] || PlaidEnvironments.sandbox;
const plaid = new PlaidApi(new Configuration({
  basePath,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
}));

const dataDir = path.resolve('.data');
const dataFile = path.join(dataDir, 'pocketweek.json');
function readStore(){
  try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
  catch { return { accessToken: null, itemId: null, cursor: null }; }
}
function writeStore(v){
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(v, null, 2));
}
function requireKeys(req,res,next){
  if(!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET){
    return res.status(503).json({ error:'Plaid server keys are not configured yet.' });
  }
  next();
}

app.get('/api/health', (req,res)=>res.json({ ok:true, plaidEnv:envName }));

app.post('/api/create-link-token', requireKeys, async (req,res)=>{
  try{
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: 'pocketweek-owner' },
      client_name: 'PocketWeek',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
      webhook: process.env.PLAID_WEBHOOK_URL || undefined,
      transactions: { days_requested: 90 },
    });
    res.json({ link_token: response.data.link_token });
  }catch(e){
    console.error(e.response?.data || e);
    res.status(500).json({ error:'Unable to create bank connection session.' });
  }
});

app.post('/api/exchange-public-token', requireKeys, async (req,res)=>{
  try{
    if(!req.body?.public_token) return res.status(400).json({error:'Missing public_token'});
    const response = await plaid.itemPublicTokenExchange({ public_token:req.body.public_token });
    const store = readStore();
    store.accessToken = response.data.access_token;
    store.itemId = response.data.item_id;
    store.cursor = null;
    writeStore(store);
    res.json({ ok:true, item_id:response.data.item_id });
  }catch(e){
    console.error(e.response?.data || e);
    res.status(500).json({ error:'Unable to finish bank connection.' });
  }
});

app.get('/api/accounts', requireKeys, async (req,res)=>{
  try{
    const store=readStore();
    if(!store.accessToken) return res.json({ connected:false, accounts:[] });
    const response=await plaid.accountsGet({ access_token:store.accessToken });
    res.json({ connected:true, accounts:response.data.accounts.map(a=>({
      id:a.account_id,name:a.name,official_name:a.official_name,mask:a.mask,type:a.type,subtype:a.subtype,
      balances:a.balances
    })) });
  }catch(e){
    console.error(e.response?.data || e);
    res.status(500).json({ error:'Unable to load accounts.' });
  }
});

app.post('/api/sync-transactions', requireKeys, async (req,res)=>{
  try{
    const store=readStore();
    if(!store.accessToken) return res.status(409).json({error:'Connect a bank first.'});
    let cursor=store.cursor || undefined, added=[], modified=[], removed=[], hasMore=true;
    while(hasMore){
      const response=await plaid.transactionsSync({access_token:store.accessToken,cursor,count:100});
      const d=response.data;
      added.push(...d.added); modified.push(...d.modified); removed.push(...d.removed);
      cursor=d.next_cursor; hasMore=d.has_more;
    }
    store.cursor=cursor; writeStore(store);
    res.json({added,modified,removed,cursor});
  }catch(e){
    console.error(e.response?.data || e);
    res.status(500).json({ error:'Unable to sync transactions.' });
  }
});

app.post('/api/webhook', async (req,res)=>{
  // A production deployment should verify and process Plaid webhooks.
  // /transactions/sync remains the source of truth for incremental changes.
  res.sendStatus(200);
});

app.listen(port, ()=>console.log(`PocketWeek bank API listening on :${port} (${envName})`));
