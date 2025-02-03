const axios = require('axios');
const chalk = require('chalk');
const WebSocket = require('ws');
const fs = require('fs');
const keypress = require('keypress');

let accounts = [];
let sockets = [];
let pingIntervals = [];
let userData = [];
let currentAccountIndex = 0;
const version = "v0.2";
const wsUrl = "wss://secure.ws.teneo.pro/websocket";
const loginUrl = "https://auth.teneo.pro/api/login";

// Load accounts from file
function loadAccounts() {
    if (!fs.existsSync('account.txt')) {
        console.error('Error: account.txt not found.');
        process.exit(1);
    }
    accounts = fs.readFileSync('account.txt', 'utf8')
        .split('\n')
        .map(line => {
            const [email, password] = line.split(',').map(s => s.trim());
            return email && password ? { email, password } : null;
        })
        .filter(Boolean);
}

// Authenticate all accounts in parallel
async function authenticateAll() {
    console.log(chalk.cyan("Logging in..."));
    try {
        const authPromises = accounts.map((account, index) => authenticateAccount(account, index));
        await Promise.all(authPromises);
        console.log(chalk.green("All accounts authenticated successfully!"));
    } catch (error) {
        console.error(chalk.red("Authentication error: "), error.message);
    }
}

// Authenticate a single account
async function authenticateAccount(account, index) {
    try {
        const response = await axios.post(loginUrl, {
            email: account.email,
            password: account.password
        }, { headers: { 'Content-Type': 'application/json' } });

        userData[index] = {
            email: account.email,
            userId: response.data.user.id,
            accessToken: response.data.access_token,
            pointsTotal: 0,
            pointsToday: 0,
            message: "Connected successfully"
        };

        connectWebSocket(index);
    } catch (error) {
        console.error(`Error logging in ${account.email}: ${error.message}`);
    }
}

// Connect WebSocket with reconnection strategy
function connectWebSocket(index, retryCount = 0) {
    if (retryCount > 5) {
        console.error(`Account ${index + 1} exceeded max reconnection attempts.`);
        return;
    }

    const token = userData[index]?.accessToken;
    if (!token) return;

    sockets[index] = new WebSocket(`${wsUrl}?accessToken=${encodeURIComponent(token)}&version=${version}`);

    sockets[index].onopen = () => {
        console.log(`Account ${index + 1} Connected`);
        startPinging(index);
    };

    sockets[index].onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.pointsTotal !== undefined && data.pointsToday !== undefined) {
            userData[index].pointsTotal = data.pointsTotal;
            userData[index].pointsToday = data.pointsToday;
            if (index === currentAccountIndex) displayAccountData(index);
        }
    };

    sockets[index].onclose = () => {
        console.log(`Account ${index + 1} Disconnected. Reconnecting...`);
        setTimeout(() => connectWebSocket(index, retryCount + 1), Math.min(1000 * (2 ** retryCount), 30000));
    };

    sockets[index].onerror = (error) => {
        console.error(`WebSocket error for Account ${index + 1}:`, error.message);
    };
}

// Start periodic WebSocket pings
function startPinging(index) {
    pingIntervals[index] = setInterval(() => {
        if (sockets[index]?.readyState === WebSocket.OPEN) {
            sockets[index].send(JSON.stringify({ type: "PING" }));
        }
    }, 60000);
}

// Display account data
function displayAccountData(index) {
    console.clear();
    const account = userData[index];
    if (!account) return;
    
    console.log(chalk.cyan(`\nAccount ${index + 1}`));
    console.log(chalk.whiteBright(`Email: ${account.email}`));
    console.log(`User ID: ${account.userId}`);
    console.log(chalk.green(`Points Total: ${account.pointsTotal}`));
    console.log(chalk.green(`Points Today: ${account.pointsToday}`));
    console.log(chalk.whiteBright(`Message: ${account.message}`));
}

// Handle user input
function handleUserInput() {
    keypress(process.stdin);

    process.stdin.on('keypress', (ch, key) => {
        if (!key) return;
        if (key.name === 'a') {
            currentAccountIndex = (currentAccountIndex - 1 + accounts.length) % accounts.length;
        } else if (key.name === 'd') {
            currentAccountIndex = (currentAccountIndex + 1) % accounts.length;
        } else if (key.name === 'c') {
            console.log('Exiting the script...');
            process.exit();
        }
        displayAccountData(currentAccountIndex);
    });

    process.stdin.setRawMode(true);
    process.stdin.resume();
}

// Initialize script
async function initialize() {
    loadAccounts();
    await authenticateAll();
    displayAccountData(currentAccountIndex);
    handleUserInput();
}

initialize();
