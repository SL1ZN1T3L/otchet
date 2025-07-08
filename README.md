# Моя личная шпаргалка

## 1. Клонировать и зайти в папку
git clone <URL>
cd otchet

## 2. Настроить окружение
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

## 3. Настроить БД и создать юзера
export FLASK_APP=app.py  # (или 'set' для Windows)
flask db upgrade
flask create-user my-login my-password

## 4. Запустить!
python app.py
