const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve('public');
const samples = [
 ['What is the capital of Australia?', ['Sydney','Melbourne','Canberra','Perth']],
 ['Which composer became deaf later in life?', ['Wolfgang Amadeus Mozart','Johann Sebastian Bach','Ludwig van Beethoven','Franz Joseph Haydn']],
 ['Which organisation is responsible for preserving cultural heritage around the world?', ['United Nations Educational, Scientific and Cultural Organization','World Health Organization','International Monetary Fund','World Trade Organization']],
];
const adminDays = new Map([["2026-10-14", Array.from({length:13},(_,i)=>({
  type:"multiple_choice", question_en:samples[i%3][0], question_de:"Beispielfrage "+(i+1),
  data:{options_en:samples[i%3][1],options_de:samples[i%3][1]},answer:{correct_index:2},
  category:"general",difficulty:1,
}))]]);
http.createServer(async (req,res)=>{
 const url = new URL(req.url,'http://localhost');
 if(url.pathname === '/api/admin/days') {
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({days:[...adminDays.keys()].sort().reverse()}));return;
 }
 if(url.pathname === '/api/admin/day') {
  res.setHeader('Content-Type','application/json');
  const date=url.searchParams.get('date');
  if(req.method==='GET') {res.end(JSON.stringify({date,questions:adminDays.get(date)}));return;}
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw);
  adminDays.set(date,body.questions);res.end(JSON.stringify({saved:true,date}));return;
 }
 if(url.pathname === '/api/daily') {
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({date:'2026-10-14',questions:Array.from({length:13},(_,i)=>({id:i+1,type:'multiple_choice',question_en:samples[i%3][0],question_de:samples[i%3][0],data:{options_en:samples[i%3][1],options_de:samples[i%3][1]},answer:{correct_index:2}}))}));return;
 }
 if(url.pathname === '/api/answers'){res.setHeader('Content-Type','application/json');res.end('{"saved":true}');return;}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.ttf':'font/ttf'};
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
 fs.createReadStream(file).pipe(res);
}).listen(8788,'127.0.0.1',()=>console.log('Local visual preview at http://localhost:8788 (mock quiz, no database writes)'));
