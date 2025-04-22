from flask import Flask, render_template, request, redirect, url_for, session, flash
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash

import sqlite3

conn = sqlite3.connect('users.db')
conn.execute('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT)')

conn.close()

app = Flask(__name__)
app.secret_key = 'F92jsj39vfjQw7&$!Kmdslz38zPq'

def get_db():
    conn = sqlite3.connect('users.db')
    conn.row_factory = sqlite3.Row
    return conn

import re  # at the top of app.py

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        email = request.form['username']
        password = request.form['password']

        # Validate email
        email_regex = r'^[\w\.-]+@[\w\.-]+\.\w+$'
        if not re.match(email_regex, email):
            flash('Invalid email format.')
            return render_template('signup.html')

        # Validate password length
        if len(password) < 8:
            flash('Password must be at least 8 characters long.')
            return render_template('signup.html')

        hashed = generate_password_hash(password)
        conn = get_db()
        conn.execute("INSERT INTO users (username, password) VALUES (?, ?)", (email, hashed))
        conn.commit()
        conn.close()
        return redirect(url_for('login'))

    return render_template('signup.html')
@app.route('/home')
def dashboard():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (session['user_id'],)).fetchone()
    conn.close()

    return render_template('home.html', user=user)

@app.route('/logout')
def logout():
    session.pop('user_id', None)
    return redirect(url_for('login'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        conn = get_db()
        user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        conn.close()

        if user and check_password_hash(user['password'], password):
            session['user_id'] = user['id']
            return redirect(url_for('dashboard'))  # or whatever you named the home route

        else:
            flash("Invalid credentials")
    return render_template('login.html')
@app.route('/')
def home():
    return render_template('index.html')


if __name__ == '__main__':
    app.run(debug=True)
