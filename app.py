import os
import uuid
from click import argument
from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user, login_required
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import func
from datetime import datetime
from waitress import serve

basedir = os.path.abspath(os.path.dirname(__file__))

# --- 1. Конфигурация Приложения ---
app = Flask(__name__)
app.config['SECRET_KEY'] = 'SmkJGmaU2nutF1ey1RS4qJKkScQp8g43VpMynzRpE8T1YaEa'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'app.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- 2. Инициализация Расширений ---
db = SQLAlchemy(app)
migrate = Migrate(app, db)
login = LoginManager(app)
login.login_view = 'login'
login.login_message = 'Пожалуйста, войдите для доступа к этой странице.'
login.login_message_category = 'info'


# --- 3. Модели Базы Данных ---

def generate_uuid():
    return str(uuid.uuid4())

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), index=True, unique=True)
    password_hash = db.Column(db.String(256))

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

@login.user_loader
def load_user(id):
    return db.session.get(User, int(id))

# ИЗМЕНЕНО: Добавлено поле report_num
class Report(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    report_num = db.Column(db.Integer, unique=True, nullable=False, index=True)
    data = db.Column(db.JSON)
    is_finished = db.Column(db.Boolean, default=False)

class Employee(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128))
    title = db.Column(db.String(128))
    full_name = db.Column(db.String(256))


# --- 4. Маршруты (Routes) ---

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        data = request.get_json()
        user = User.query.filter_by(username=data['username']).first()
        if user is None or not user.check_password(data['password']):
            return jsonify({'error': 'Неверный логин или пароль'}), 401
        login_user(user, remember=True)
        return jsonify({'success': True}), 200
    return render_template('login.html', title='Вход')

@app.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    return render_template('index.html')


@app.route('/api/database', methods=['GET'])
@login_required
def get_full_db():
    # ИЗМЕНЕНО: Сортировка по убыванию номера отчета
    reports = Report.query.order_by(Report.report_num.desc()).all()
    employees = Employee.query.all()
    
    reports_dict = {r.id: {'data': r.data, 'isFinished': r.is_finished} for r in reports}
    employees_list = [{'id': e.id, 'name': e.name, 'title': e.title, 'fullName': e.full_name} for e in employees]

    active_id = reports[0].id if reports else None

    response_data = {
        'reports': reports_dict,
        'employees': employees_list,
        'activeReportId': active_id
    }
    return jsonify(response_data)

# ИЗМЕНЕНО: Логика создания отчета
@app.route('/api/reports', methods=['POST'])
@login_required
def create_report():
    max_num = db.session.query(func.max(Report.report_num)).scalar()
    new_num = 1 if max_num is None else max_num + 1

    default_data = request.get_json()
    if not default_data:
        today = datetime.now()
        default_data = {
            'author': 'Не назначен',
            'date': today.strftime('%Y-%m-%d'),
            'status': "В работе"
        }
    
    default_data['id'] = f"Отчет №{new_num:03d}"
    
    new_report = Report(
        report_num=new_num,
        data=default_data,
        is_finished=False
    )
    db.session.add(new_report)
    db.session.commit()
    
    return jsonify({
        'id': new_report.id,
        'report': {
            'data': new_report.data,
            'isFinished': new_report.is_finished
        }
    }), 201


@app.route('/api/reports/<report_id>', methods=['PUT'])
@login_required
def update_report(report_id):
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404
        
    data = request.get_json()
    if 'data' in data:
        report.data = data['data']
    if 'isFinished' in data:
        report.is_finished = data['isFinished']
    db.session.commit()
    return jsonify({'success': True, 'message': 'Отчет обновлен'}), 200

@app.route('/api/reports/<report_id>', methods=['DELETE'])
@login_required
def delete_report(report_id):
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({'error': 'Report not found'}), 404

    db.session.delete(report)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Отчет удален'}), 200

@app.route('/api/employees', methods=['POST'])
@login_required
def create_employee():
    data = request.get_json()
    if not data or 'name' not in data or 'title' not in data:
        return jsonify({'error': 'Missing data'}), 400
    
    full_name = f"{data['name']}, {data['title']}"
    employee = Employee(name=data['name'], title=data['title'], full_name=full_name)
    db.session.add(employee)
    db.session.commit()
    
    return jsonify({
        'id': employee.id, 
        'name': employee.name, 
        'title': employee.title,
        'fullName': employee.full_name
        }), 201

@app.route('/api/employees/<int:employee_id>', methods=['DELETE'])
@login_required
def delete_employee(employee_id):
    employee = db.session.get(Employee, employee_id)
    if not employee:
        return jsonify({'error': 'Employee not found'}), 404

    db.session.delete(employee)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Сотрудник удален'}), 200

# --- 5. Команды для командной строки ---
@app.cli.command("create-user")
@argument("username")
@argument("password")
def create_user(username, password):
    """Создает нового пользователя в системе."""
    if User.query.filter_by(username=username).first():
        print(f"Пользователь {username} уже существует.")
        return
    user = User(username=username)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    print(f"Пользователь {username} успешно создан.")

@app.cli.command("set-password")
@argument("username")
@argument("password")
def set_password(username, password):
    """Изменяет пароль для существующего пользователя."""
    user = User.query.filter_by(username=username).first()
    if user is None:
        print(f"Пользователь '{username}' не найден.")
        return
    
    user.set_password(password)
    db.session.commit()
    print(f"Пароль для пользователя '{username}' был успешно изменен.")

@app.cli.command("rename-user")
@argument("old_username")
@argument("new_username")
def rename_user(old_username, new_username):
    """Изменяет имя пользователя (логин)."""
    # Сначала проверим, не занято ли новое имя
    if User.query.filter_by(username=new_username).first():
        print(f"Ошибка: Пользователь с именем '{new_username}' уже существует.")
        return

    # Теперь ищем старого пользователя
    user = User.query.filter_by(username=old_username).first()
    if user is None:
        print(f"Ошибка: Пользователь с именем '{old_username}' не найден.")
        return
    
    # Если все проверки пройдены, меняем имя и сохраняем
    user.username = new_username
    db.session.commit()
    print(f"Пользователь '{old_username}' успешно переименован в '{new_username}'.")

if __name__ == '__main__':
    # Старый способ для разработки (НЕ ИСПОЛЬЗОВАТЬ В PRODUCTION!)
    # app.run(debug=True)

    # Новый, правильный способ для production через Waitress
    print("Starting production server on http://127.0.0.1:8000")
    serve(app, host="127.0.0.1", port=8000, threads=8)