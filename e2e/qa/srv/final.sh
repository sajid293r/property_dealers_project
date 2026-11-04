cd /d/BYTE_CRAFT/Property_Dealers_Project/e2e/qa
timeout 590 node g3-states.mjs > srv/states.log 2>&1
node g3-seed.mjs > /dev/null 2>&1
WIDTHS=320,375,768,1024 timeout 590 node g3-overflow.mjs > srv/ov3.log 2>&1
echo finished > srv/final.done
