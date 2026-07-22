# Attendo — Smart Attendance Manager

A mobile-first web application that digitizes classroom attendance — built to replace the age-old paper attendance sheet with a fast, mobile-friendly, and report-ready system for teachers and professors.

## 🎯 The Problem

In most colleges and schools, attendance is still tracked the traditional way: the professor carries a **physical sheet** to class every day, students sign against their names, and at the end of the month someone manually counts entries to calculate attendance percentages. This process is slow, error-prone, easy to lose, and impossible to generate reports from instantly.

## 💡 The Solution

**Attendo** lets a professor take attendance **directly from their phone** in the classroom — no paper, no manual counting. Every class session is logged with its date and subject, so attendance is calculated only from the actual days a class was held (e.g. if only 4 classes were held in a month, the percentage is calculated out of 4 — not 30).

At the end of the month, the system automatically computes each student's attendance count and percentage, and generates a **downloadable PDF report** — ready to share or submit.

## ✨ Features

- 🔐 **Secure sign-up/login** for teachers
- 🏫 **Flexible class setup** — works for both college (department + semester) and school (11th/12th with stream: Science/Commerce/Arts)
- 👥 **Student roster management** — add/remove students with unique roll numbers
- ✅ **Session-based attendance** — mark present/absent for any specific date, not forced daily entry
- 📊 **Automatic monthly reports** — total classes held, per-student present count, and attendance percentage
- 📄 **One-click PDF export** — clean, printable monthly attendance report
- 📱 **Fully responsive** — designed mobile-first so professors can take attendance from their phone in class

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3 (custom design system), Vanilla JavaScript (SPA architecture)
- **PDF Generation:** jsPDF + jsPDF-AutoTable
- **Data Persistence:** Browser LocalStorage
- **Hosting:** Deployed on Netlify / Vercel

## 🚀 Live Demo

`[Add your deployed link here after hosting, e.g. https://attendo-yourname.netlify.app]`

## 📸 Screenshots

`<img width="547" height="668" alt="Screenshot 2026-07-22 172935" src="https://github.com/user-attachments/assets/05ac8c57-9b63-4c58-bcb2-dd3afe45bbf0" />
`

## ⚙️ Getting Started (Run Locally)

```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>
```

Just open `index.html` in any browser — no build step or server required.

## 📈 Future Scope

- Backend + database (Node.js/Express + PostgreSQL) for multi-device sync across teachers
- QR-code or biometric-assisted attendance
- Email/SMS notifications for low attendance
- Admin dashboard for institution-wide analytics

## 👤 Author

Built by **Nandan Kumar**, CSE final year student, as a solution to a real problem observed in classrooms — turning a manual, paper-based process into a fast digital workflow.
