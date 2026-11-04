cd /d/BYTE_CRAFT/Property_Dealers_Project/e2e/qa
for f in run finance sales modules features language; do timeout 290 node g3-$f.mjs > srv/e2e-$f.log 2>&1; echo "$f exit $? pass=$(grep -c '  PASS' srv/e2e-$f.log) fail=$(grep -c '  FAIL' srv/e2e-$f.log)" >> srv/e2e-summary.log; done
echo finished >> srv/e2e-summary.log
