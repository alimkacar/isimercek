#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
isimercek_node="$(command -v node)"
if [[ -z "$isimercek_node" ]]; then
  print 'Node.js 20 veya daha yeni bir sürüm gerekli.'
  read '?Pencereyi kapatmak için Enter: '
  exit 1
fi
print 'IsıMercek bu cihazda çalışıyor. Tarayıcıdan http://127.0.0.1:4310 adresini açın.'
print 'Belgeden doldurma için klasöre GEMINI_API_KEY içeren bir .env dosyası koyun (.env.example).'
print 'Bu pencere açık kaldığı sürece uygulama çalışır. Durdurmak için Ctrl+C.'
"$isimercek_node" server.mjs
