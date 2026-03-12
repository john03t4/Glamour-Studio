const express = require('express');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const cron = require('node-cron');
const cookieParser = require('cookie-parser');
const app = express();
const PORT = process.env.PORT || 3000;

// 1️⃣: Basic Server Setup
app.use(express.json()); // JSON body parsing
app.use(cookieParser('your-super-secret-for-signing-cookies')); // Add a secret for signed cookies
// CORS Configuration
app.use(cors({
    origin: function (origin, callback) {
        // This allows any origin (like 127.0.0.1:5500) to communicate 
        // with your localhost:3000 server
        return callback(null, true);
    },
    credentials: true // Crucial for allowing the browser to store the login cookie
}));

// Admin User Configuration
const ADMIN_USER = {
    email: 'admin@glamour.com',
    password: 'password123' // In production, use environment variables and hashed passwords
};

// Database Setup
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        return console.error('Error opening database:', err.message);
    }
    console.log('Connected to the SQLite database.');
});

// Create tables if they don't exist.
db.serialize(() => {
    // For the whitelist feature
    db.run('CREATE TABLE IF NOT EXISTS whitelist (email TEXT UNIQUE NOT NULL PRIMARY KEY)');
    // For storing bookings persistently
    db.run(`
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            serviceId INTEGER NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            email TEXT,
            token TEXT
        )
    `);
    // Attempt to add columns for existing databases (ignoring errors if they exist)
    db.run("ALTER TABLE bookings ADD COLUMN email TEXT", () => {});
    db.run("ALTER TABLE bookings ADD COLUMN token TEXT", () => {});
});

// Email Transporter Setup using Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail', // Or your preferred email service
    auth: {
        user: 'john03t4@gmail.com', // REPLACE WITH YOUR EMAIL
        pass: 'yokxpnmbfstvqbdd' // REPLACE WITH YOUR APP PASSWORD
    }
});

// 2️⃣: Services Data
const services = [
    { id: 1, name: 'Flawless Frontal Install', price: 45000, duration: 180 },
    { id: 2, name: 'Wig Revamp', price: 25000, duration: 120 },
    { id: 3, name: 'Custom Wig Making', price: 60000, duration: 240 },
    { id: 4, name: 'Bridal Styling', price: 150000, duration: 300 },
    { id: 5, name: 'Simple Cornrows', price: 15000, duration: 90 },
];

// 4️⃣: API Endpoint to Get Services
app.get('/api/services', (req, res) => {
    res.json(services);
});

// 5️⃣: API Endpoint for Availability
app.get('/api/availability', (req, res) => {
    const { date, serviceId } = req.query;

    if (!date || !serviceId) {
        return res.status(400).json({ message: 'Date and service ID are required.' });
    }

    const service = services.find(s => s.id === parseInt(serviceId));
    if (!service) {
        return res.status(404).json({ message: 'Service not found.' });
    }

    // 1️⃣2️⃣: Validation (Sunday bookings)
    const selectedDate = new Date(date);
    if (selectedDate.getUTCDay() === 0) { // 0 is Sunday
        return res.json([]); // No slots on Sunday
    }

    // Fetch existing bookings for the selected date from the database
    db.all('SELECT * FROM bookings WHERE date = ?', [date], (err, bookings) => {
        if (err) {
            console.error('Database error on availability check:', err.message);
            return res.status(500).json({ message: 'Error checking availability.' });
        }

        const workingHours = { start: 9, end: 18 }; // 9 AM to 6 PM
        const slotInterval = 30; // 30-minute slots
        const serviceDuration = service.duration;

        const availableSlots = [];

        for (let hour = workingHours.start; hour < workingHours.end; hour++) {
            for (let minute = 0; minute < 60; minute += slotInterval) {
                const slotStart = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
                const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60 * 1000);

                // 1️⃣2️⃣: Validation (Outside working hours)
                if (slotEnd.getHours() > workingHours.end || (slotEnd.getHours() === workingHours.end && slotEnd.getMinutes() > 0)) {
                    continue; // Slot extends beyond working hours
                }

                let isBooked = false;
                for (const booking of bookings) {
                    if (booking.date !== date) continue;

                    const existingService = services.find(s => s.id === booking.serviceId);
                    if (!existingService) continue;
                    const bookingStart = new Date(`${booking.date}T${booking.time}`);
                    const bookingEnd = new Date(bookingStart.getTime() + existingService.duration * 60 * 1000);

                    // Check for overlap
                    if (slotStart < bookingEnd && slotEnd > bookingStart) {
                        isBooked = true;
                        break;
                    }
                }

                if (!isBooked) {
                    availableSlots.push(slotStart.toTimeString().substring(0, 5));
                }
            }
        }

        res.json(availableSlots);
    });
});

// 6️⃣: API Endpoint to Create a Booking
app.post('/api/bookings', (req, res) => {
    const { name, phone, serviceId, date, time, email } = req.body;

    // 1️⃣2️⃣: Validation (Empty inputs)
    if (!name || !phone || !serviceId || !date || !time) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    const service = services.find(s => s.id === parseInt(serviceId));
    if (!service) {
        return res.status(404).json({ message: 'Service not found.' });
    }

    const requestedStartTime = new Date(`${date}T${time}`);
    const requestedEndTime = new Date(requestedStartTime.getTime() + service.duration * 60 * 1000);

    // 1️⃣2️⃣: Validation (Past dates)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (requestedStartTime < today) {
        return res.status(400).json({ message: 'Cannot book in the past.' });
    }

    // 1️⃣2️⃣: Validation (Sunday bookings)
    if (requestedStartTime.getUTCDay() === 0) {
        return res.status(400).json({ message: 'Bookings are not available on Sundays.' });
    }

    // 1️⃣2️⃣: Validation (Outside working hours)
    const workingHours = { start: 9, end: 18 };
    if (requestedStartTime.getHours() < workingHours.start || requestedEndTime.getHours() > workingHours.end || (requestedEndTime.getHours() === workingHours.end && requestedEndTime.getMinutes() > 0)) {
        return res.status(400).json({ message: 'Booking is outside of working hours.' });
    }

    // Check for conflicts in the database
    db.all('SELECT * FROM bookings WHERE date = ?', [date], (err, bookingsOnDate) => {
        if (err) {
            console.error('Database error on booking creation:', err.message);
            return res.status(500).json({ message: 'Could not check for booking conflicts.' });
        }

        for (const booking of bookingsOnDate) {
            const existingService = services.find(s => s.id === booking.serviceId);
            if (!existingService) continue;
            const existingStartTime = new Date(`${booking.date}T${booking.time}`);
            const existingEndTime = new Date(existingStartTime.getTime() + existingService.duration * 60 * 1000);

            if (requestedStartTime < existingEndTime && requestedEndTime > existingStartTime) {
                return res.status(409).json({ message: 'This time slot is already booked. Please choose another time.' });
            }
        }

        // No conflicts, insert new booking into the database
        const token = crypto.randomBytes(16).toString('hex');
        const sql = 'INSERT INTO bookings (name, phone, serviceId, date, time, email, token) VALUES (?, ?, ?, ?, ?, ?, ?)';
        const params = [name, phone, parseInt(serviceId), date, time, email || null, token];

        db.run(sql, params, function (err) {
            if (err) {
                console.error('Database insert error:', err.message);
                return res.status(500).json({ message: 'Failed to save booking.' });
            }

            const newBooking = {
                id: this.lastID,
                name,
                phone,
                serviceId: parseInt(serviceId),
                date,
                time,
                email,
                token
            };

            // Send email notification
            const mailOptions = {
                from: `"Glamour Studio" <${process.env.EMAIL_USER}>`,
                to: 'john03t4@gmail.com', // Your notification email
                subject: 'New Appointment Booking!',
                html: `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 20px auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                        <div style="background-color: #121212; color: #D4AF37; padding: 20px; text-align: center;">
                            <h1 style="margin: 0; font-family: 'Cormorant Garamond', serif; font-size: 28px;">Glamour Studio</h1>
                        </div>
                        <div style="padding: 25px; background-color: #ffffff;">
                            <h2 style="color: #333; text-align: center;">New Appointment Confirmation</h2>
                            <p style="text-align: center; color: #555;">A new appointment has been scheduled. Please see the details below.</p>
                            <table style="width: 100%; border-collapse: collapse; margin-top: 25px; background-color: #fff; border-radius: 4px; border: 1px solid #eee;">
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 12px 15px; font-weight: bold; color: #555; width: 120px;">Name:</td>
                                    <td style="padding: 12px 15px;">${name}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 12px 15px; font-weight: bold; color: #555;">Phone:</td>
                                    <td style="padding: 12px 15px;">${phone}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 12px 15px; font-weight: bold; color: #555;">Service:</td>
                                    <td style="padding: 12px 15px;">${service.name}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 12px 15px; font-weight: bold; color: #555;">Date:</td>
                                    <td style="padding: 12px 15px;">${new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px 15px; font-weight: bold; color: #555;">Time:</td>
                                    <td style="padding: 12px 15px;">${time}</td>
                                </tr>
                            </table>
                        </div>
                        <div style="background-color: #121212; color: #A0A0A0; padding: 15px; text-align: center; font-size: 12px;">
                            <p style="margin: 0;">&copy; ${new Date().getFullYear()} Glamour Studio. All rights reserved.</p>
                        </div>
                    </div>
                `
            };

            // Send confirmation to User (if email provided)
            if (email) {
                const cancelLink = `${req.protocol}://${req.get('host')}/cancel-booking?id=${this.lastID}&token=${token}`;
                const userMailOptions = {
                    from: `"Glamour Studio" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: 'Appointment Confirmation - Glamour Studio',
                    html: `
                        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 20px auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                            <div style="background-color: #121212; color: #D4AF37; padding: 20px; text-align: center;">
                                <h1 style="margin: 0; font-family: 'Cormorant Garamond', serif; font-size: 28px;">Glamour Studio</h1>
                            </div>
                            <div style="padding: 25px; background-color: #ffffff;">
                                <h2 style="color: #333; text-align: center;">Appointment Confirmed</h2>
                                <p style="text-align: center; color: #555;">Hello ${name}, your appointment has been successfully booked.</p>
                                <table style="width: 100%; border-collapse: collapse; margin-top: 25px; background-color: #fff; border-radius: 4px; border: 1px solid #eee;">
                                    <tr style="border-bottom: 1px solid #eee;">
                                        <td style="padding: 12px 15px; font-weight: bold; color: #555; width: 120px;">Service:</td>
                                        <td style="padding: 12px 15px;">${service.name}</td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid #eee;">
                                        <td style="padding: 12px 15px; font-weight: bold; color: #555;">Date:</td>
                                        <td style="padding: 12px 15px;">${new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 12px 15px; font-weight: bold; color: #555;">Time:</td>
                                        <td style="padding: 12px 15px;">${time}</td>
                                    </tr>
                                </table>
                                <div style="margin-top: 30px; text-align: center; padding-top: 20px; border-top: 1px solid #eee;">
                                    <p style="color: #777; font-size: 14px;">Did not book this appointment?</p>
                                    <a href="${cancelLink}" style="display: inline-block; padding: 10px 20px; background-color: #d9534f; color: white; text-decoration: none; border-radius: 4px; font-size: 14px;">Cancel Appointment</a>
                                </div>
                            </div>
                            <div style="background-color: #121212; color: #A0A0A0; padding: 15px; text-align: center; font-size: 12px;">
                                <p style="margin: 0;">&copy; ${new Date().getFullYear()} Glamour Studio. All rights reserved.</p>
                            </div>
                        </div>
                    `
                };
                transporter.sendMail(userMailOptions, (error, info) => {
                    if (error) console.error('Error sending user confirmation:', error);
                });
            }

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('Error sending email:', error); // Log email error but don't fail the request
                } else {
                    console.log('Email sent: ' + info.response);
                }
            });

            res.status(201).json({ message: 'Booking successful!', booking: newBooking });
        });
    });
});

// API Endpoint to join whitelist
app.post('/api/whitelist', (req, res) => {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ message: 'A valid email is required.' });
    }

    const sql = 'INSERT INTO whitelist (email) VALUES (?)';
    db.run(sql, [email], function(err) {
        if (err) {
            // Check for unique constraint violation
            if (err.code === 'SQLITE_CONSTRAINT') {
                return res.status(409).json({ message: 'This email is already on the whitelist.' });
            }
            console.error('Database error:', err.message);
            return res.status(500).json({ message: 'Error saving email to the database.' });
        }
        console.log(`A new email was inserted: ${email}`);
        res.status(201).json({ message: 'Successfully joined the whitelist!' });
    });
});

// --- Admin Authentication Middleware ---
function authAdmin(req, res, next) {
    if (req.signedCookies.admin_session === 'logged_in') {
        return next();
    }
    return res.status(401).json({ message: 'Unauthorized' });
}

// Admin Login Endpoint
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;

    if (email === ADMIN_USER.email && password === ADMIN_USER.password) {

        const isProduction = process.env.NODE_ENV === "production";

        res.cookie('admin_session', 'logged_in', {
            signed: true,
            httpOnly: true,
            secure: isProduction, // true when hosted on HTTPS
            sameSite: isProduction ? 'none' : 'lax', 
            maxAge: 24 * 60 * 60 * 1000
        });

        return res.status(200).json({
            success: true,
            message: 'Login successful'
        });
    }

    res.status(401).json({
        success: false,
        message: 'Invalid credentials'
    });
});

// Admin Logout Endpoint
app.post('/api/admin/logout', (req, res) => {
    res.clearCookie('admin_session', {
        httpOnly: true,
        signed: true
    });

    res.status(200).json({
        message: 'Logged out successfully'
    });
});

// 1️⃣1️⃣: Admin Endpoints
// Get all bookings
app.get('/api/bookings', authAdmin, (req, res) => {
    const sql = 'SELECT * FROM bookings ORDER BY date, time';
    db.all(sql, [], (err, bookings) => {
        if (err) {
            console.error('Database error fetching bookings:', err.message);
            return res.status(500).json({ message: 'Error fetching bookings.' });
        }

        const detailedBookings = bookings.map(booking => {
            const service = services.find(s => s.id === booking.serviceId);
            return { 
                ...booking, 
                serviceName: service ? service.name : 'Unknown Service',
                price: service ? service.price : 0 
            };
        });
        res.json(detailedBookings);
    });
});

// Get all whitelist emails
app.get('/api/whitelist', authAdmin, (req, res) => {
    const sql = 'SELECT email FROM whitelist ORDER BY email';
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).json({ message: 'Error fetching emails from the database.' });
        }
        // .map() to transform the array of objects into an array of strings
        const emails = rows.map(row => row.email);
        res.json(emails);
    });
});

// Delete a booking
app.delete('/api/bookings/:id', authAdmin, (req, res) => {
    const bookingId = parseInt(req.params.id);
    const sql = 'DELETE FROM bookings WHERE id = ?';

    db.run(sql, bookingId, function (err) {
        if (err) {
            console.error('Database delete error:', err.message);
            return res.status(500).json({ message: 'Failed to delete booking.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Booking not found.' });
        }
        res.status(200).json({ message: 'Booking deleted successfully.' });
    });
});

// Send email to all whitelist users
app.post('/api/admin/send-whitelist-email', authAdmin, (req, res) => {
    const { subject, message, isHtml } = req.body;

    if (!message) {
        return res.status(400).json({ message: 'Message content is required.' });
    }

    const sql = 'SELECT email FROM whitelist';

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).json({ message: 'Error fetching whitelist.' });
        }

        if (rows.length === 0) {
            return res.status(404).json({ message: 'No users in whitelist.' });
        }

        const emails = rows.map(row => row.email);

        let htmlContent;

        if (isHtml) {
            htmlContent = message;
        } else {
            // Automatically add CSS styled template
            htmlContent = `
            <div style="
                font-family: Arial, sans-serif;
                background:#f4f4f4;
                padding:40px;
            ">
                <div style="
                    max-width:600px;
                    margin:auto;
                    background:white;
                    padding:30px;
                    border-radius:8px;
                    box-shadow:0 2px 10px rgba(0,0,0,0.1);
                ">
                    <h2 style="color:#d4af37;">Glamour Studio</h2>
                    
                    <p style="
                        font-size:16px;
                        color:#333;
                        line-height:1.6;
                        white-space:pre-line;
                    ">
                        ${message}
                    </p>

                    <hr style="margin:30px 0;border:none;border-top:1px solid #eee">

                    <p style="font-size:12px;color:#999;">
                        © Glamour Studio — All rights reserved
                    </p>
                </div>
            </div>
            `;
        }

        const mailOptions = {
            from: `"Glamour Studio" <john03t4@gmail.com>`,
            bcc: emails,
            subject: subject || 'A message from Glamour Studio',
            html: htmlContent
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending bulk email:', error);
                return res.status(500).json({ message: 'Failed to send emails.' });
            }

            res.json({ message: `Email sent to ${emails.length} recipients.` });
        });
    });
});

// --- Scheduled Reminder Service ---

// This function will be called by the scheduler to send reminders for appointments happening tomorrow.
function sendAppointmentReminders() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    // Format as YYYY-MM-DD for SQLite
    const tomorrowDateString = tomorrow.toISOString().split('T')[0];

    console.log(`[CRON] Running job: Sending reminders for appointments on ${tomorrowDateString}`);

    const sql = `SELECT * FROM bookings WHERE date = ?`;
    db.all(sql, [tomorrowDateString], (err, bookings) => {
        if (err) {
            console.error('[CRON-ERROR] Failed to fetch bookings for reminders:', err.message);
            return;
        }

        if (bookings.length === 0) {
            console.log('[CRON] No upcoming appointments for tomorrow. No reminders to send.');
            return;
        }

        bookings.forEach(booking => {
            if (!booking.email) {
                console.log(`[CRON] Skipping reminder for booking ID ${booking.id}, no email provided.`);
                return;
            }

            const service = services.find(s => s.id === booking.serviceId);
            if (!service) {
                console.log(`[CRON] Skipping reminder for booking ID ${booking.id}, service not found.`);
                return;
            }

            const reminderMailOptions = {
                from: `"Glamour Studio" <john03t4@gmail.com>`,
                to: booking.email,
                subject: `Reminder: Your Appointment at Glamour Studio is Tomorrow`,
                html: `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 20px auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                        <div style="background-color: #121212; color: #D4AF37; padding: 20px; text-align: center;"><h1 style="margin: 0; font-family: 'Cormorant Garamond', serif; font-size: 28px;">Glamour Studio</h1></div>
                        <div style="padding: 25px; background-color: #ffffff;">
                            <h2 style="color: #333; text-align: center;">Appointment Reminder</h2>
                            <p style="text-align: center; color: #555;">Hello ${booking.name}, this is a friendly reminder for your appointment tomorrow.</p>
                            <table style="width: 100%; border-collapse: collapse; margin-top: 25px; background-color: #fff; border-radius: 4px; border: 1px solid #eee;">
                                <tr style="border-bottom: 1px solid #eee;"><td style="padding: 12px 15px; font-weight: bold; color: #555; width: 120px;">Service:</td><td style="padding: 12px 15px;">${service.name}</td></tr>
                                <tr style="border-bottom: 1px solid #eee;"><td style="padding: 12px 15px; font-weight: bold; color: #555;">Date:</td><td style="padding: 12px 15px;">${new Date(booking.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td></tr>
                                <tr><td style="padding: 12px 15px; font-weight: bold; color: #555;">Time:</td><td style="padding: 12px 15px;">${booking.time}</td></tr>
                            </table>
                            <div style="margin-top: 30px; text-align: center; padding-top: 20px; border-top: 1px solid #eee;"><p style="color: #777; font-size: 14px;">If you need to reschedule or cancel, please contact us as soon as possible.</p></div>
                        </div>
                        <div style="background-color: #121212; color: #A0A0A0; padding: 15px; text-align: center; font-size: 12px;"><p style="margin: 0;">&copy; ${new Date().getFullYear()} Glamour Studio. All rights reserved.</p></div>
                    </div>`
            };

            transporter.sendMail(reminderMailOptions, (error, info) => {
                if (error) console.error(`[CRON-ERROR] Failed to send reminder to ${booking.email} for booking ID ${booking.id}:`, error);
                else console.log(`[CRON] Reminder sent successfully to ${booking.email} for booking ID ${booking.id}.`);
            });
        });
    });
}

// Schedule the task to run every day at 9:00 AM Lagos time.
cron.schedule('0 9 * * *', () => {
    sendAppointmentReminders();
}, {
    scheduled: true,
    timezone: "Africa/Lagos" // Important: Set to your business's timezone
});

console.log('[CRON] Reminder service scheduled to run daily at 9:00 AM (Africa/Lagos).');

// Cancel Booking Route (via Email Link)
app.get('/cancel-booking', (req, res) => {
    const { id, token } = req.query;
    if (!id || !token) return res.status(400).send('Invalid request');

    db.get('SELECT * FROM bookings WHERE id = ? AND token = ?', [id, token], (err, row) => {
        if (err || !row) return res.status(404).send('Booking not found or invalid token.');

        db.run('DELETE FROM bookings WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).send('Error cancelling booking.');
            res.send('<div style="font-family: sans-serif; text-align: center; padding: 50px;"><h1>Booking Cancelled Successfully</h1><p>Your appointment has been cancelled.</p><a href="/">Go to Home</a></div>');
        });
    });
});

// HTML Page Routes
app.get('/services', (req, res) => {
    res.sendFile(path.join(__dirname, 'services', 'index.html'));
});

app.get('/book', (req, res) => {
    res.sendFile(path.join(__dirname, 'book', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.use(express.static(__dirname)); // Static file serving for CSS/JS

// Note: The route for "/" is handled by express.static serving index.html

// 1️⃣: Listener
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});