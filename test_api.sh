#!/bin/bash

echo "=== اختبار APIs ==="
echo ""

echo "1. اختبار تسجيل الدخول..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')
echo "$LOGIN_RESPONSE" | head -c 100
echo ""
echo ""

echo "2. اختبار الحصول على العائلات..."
curl -s http://localhost:3000/api/families | head -c 150
echo ""
echo ""

echo "3. اختبار الحصول على أفراد العائلة..."
curl -s http://localhost:3000/api/families/1/members | head -c 200
echo ""
echo ""

echo "4. اختبار البحث عن علاقة..."
curl -s "http://localhost:3000/api/families/1/find-relationship?member1=1&member2=3"
echo ""
echo ""

echo "=== اكتمل الاختبار ==="
