ASK YOUR DATA - AI data agent

WHAT IT IS
Users sign up, create databases and tables, type their data into a dashboard,
and ask questions about that data in an AI chat. The AI always reads the live
records, so anything you add or edit shows up in its answers immediately.
The AI never writes SQL itself. It only chooses between two safe tools (list
records, and count/sum/avg/min/max) and the code builds and runs the query.


WHAT IS IN THIS FOLDER
api/index.py            The whole backend (FastAPI and LangChain): login, databases,
                        tables, records and the AI chat.
public/index.html       The page shell.
public/style.css        All the styling.
public/app.js           All the screens: login, dashboard, table data entry, chat.
test_flow.py            Automatic test of the full flow (20 checks).
start.sh                One command to install everything and start the app.
test.sh                 One command to run the test.
requirements.txt        Python packages the app needs (Vercel also reads this).
requirements-dev.txt    Extra packages for running and testing on your computer.
vercel.json             Tells Vercel to send /api requests to the backend.
.env.example            Template for your secret keys.
.gitignore              Keeps your .env and .venv out of GitHub.


FIRST TIME SETUP
1. Unzip into a new folder and open that folder in VS Code.
2. Make a copy of .env.example and name the copy .env. Open it and fill in:
     DATABASE_URL = your Neon connection string (it ends with ?sslmode=require)
     GROQ_API_KEY = your Groq key
3. Open a terminal in that folder (Git Bash) and run:
     bash start.sh
   This creates the virtual environment, installs the packages and starts the
   app. Wait until you see "Uvicorn running on http://127.0.0.1:8000".
4. Open http://localhost:8000 in your browser and press Ctrl+Shift+R.

EVERY DAY AFTER THAT
Just run:  bash start.sh
Press Ctrl+C in that terminal to stop the app.


HOW TO TEST
1. Keep the app running (bash start.sh).
2. Open a second terminal in the same folder and run:  bash test.sh
3. You should see "20 passed, 0 failed".
To test a deployed app:  bash test.sh https://your-app.vercel.app


DEPLOY TO VERCEL
1. Push this folder to GitHub (your .env is ignored automatically).
2. In Vercel, import the GitHub repository.
3. In the project settings, add two environment variables:
     DATABASE_URL and GROQ_API_KEY (same values as your .env).
4. Deploy, then run the test against your live address.


HOW A QUESTION TRAVELS
You type a question in the chat.
-> public/app.js sends it to /api/databases/{table id}/chat
-> api/index.py tells the AI the table's column names and gives it two tools
-> the AI picks a tool and its filters (it only sends choices, never SQL)
-> the code checks every column name against your table, then runs a safe
   query on Neon
-> the AI turns the result into a short answer
-> the page shows the answer, plus the Data, Chart and SQL tabs.


KNOWN LIMITS
- Columns can be text or number only (no dates yet).
- The AI reads one table at a time.
- Filters combine with AND only. No median or percentiles. Max 50 rows per question.
- Login is a simple token scheme. Add proper sessions before holding real customer data.
- The model is openai/gpt-oss-120b on Groq. To change it, edit the ChatGroq line
  near the top of api/index.py.
