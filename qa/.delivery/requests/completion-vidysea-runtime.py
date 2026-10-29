import ast, json, os, time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from fastapi import FastAPI, Request, HTTPException
import uvicorn
link=json.loads(Path('qa/.delivery/completion-host-link.json').read_text())
if link.get('synthetic') is not True or link.get('base')!='http://127.0.0.1:5390' or link.get('port')!=5401: raise RuntimeError('Refusing nonlocal fixture')
os.environ['VC_STUDENT_CENTRAL_ENABLED']='true'
os.environ['VC_BASE_URL']=link['base']
os.environ['VC_PARTNER_SERVER_KEY']=link['key']
owner='00000000-0000-4000-8000-000000000012'
async def auth(request: Request):
    if not request.headers.get('authorization','').startswith('Bearer qa.'): raise HTTPException(401,'Synthetic sign-in required')
    return {'id':owner,'user_type':'student','user_obj':SimpleNamespace(id=owner,is_active=True,disabled_at=None),'claims':{'vc_eligibility':{'studentId':owner,'tenantId':'vidysea','age':22,'guardianConsent':False,'exp':int(time.time())+60,'purpose':'virtual_counsellor'}}}
db=SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda:owner)))
async def get_db(): return db
source=Path('D:/vc/.worktrees/vc-vidysea-backend/app/api/v1/student/ai_counsellor_router.py')
tree=ast.parse(source.read_text(encoding='utf8'))
tree.body=[n for n in tree.body if not(isinstance(n,ast.ImportFrom) and (str(n.module).startswith('app.') or str(n.module).startswith('sqlalchemy')))]
scope={'__name__':'vc_router_synthetic','AsyncSession':object,'get_db_session':get_db,'get_current_user':auth,'get_target_student_id':AsyncMock(),'agent':SimpleNamespace(chat=AsyncMock(side_effect=AssertionError('Legacy reached'))),'text':lambda q:q}
exec(compile(tree,str(source),'exec'),scope)
app=FastAPI();app.include_router(scope['router'],prefix='/api/v1')
uvicorn.run(app,host='127.0.0.1',port=5401,log_level='warning')
