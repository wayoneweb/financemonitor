const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/authRoute'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/upcoming', require('./routes/upcoming'));
app.use('/api/export', require('./routes/exportRoute'));
app.use('/api/import', require('./routes/importRoute'));
app.use('/api/users',       require('./routes/usersRoute'));
app.use('/api/loans',       require('./routes/loansRoute'));
app.use('/api/investments', require('./routes/investmentsRoute'));
app.use('/api/assets',      require('./routes/assetsRoute'));
app.use('/api/bank',        require('./routes/bankRoute'));
app.use('/api/invoices',    require('./routes/invoicesRoute'));
app.use('/api/hr',         require('./routes/hrRoute'));
app.use('/api/companies',          require('./routes/companiesRoute'));
app.use('/api/coa',                require('./routes/coaRoute'));
app.use('/api/vouchers',           require('./routes/vouchersRoute'));
app.use('/api/accounting-reports', require('./routes/accountingReportsRoute'));

// Serve React build in production
const clientBuild = path.join(__dirname, '../client/build');
app.use(express.static(clientBuild));

// All non-API routes serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
