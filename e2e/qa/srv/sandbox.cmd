@echo off
set SANDBOX_AUTH_PORT=54369
set SANDBOX_API_PORT=4400
set SANDBOX_WEB_ORIGIN=http://localhost:3411
cd /d D:\BYTE_CRAFT\Property_Dealers_Project\api
call npm run sandbox > D:\BYTE_CRAFT\Property_Dealers_Project\e2e\qa\srv\sandbox.log 2>&1
