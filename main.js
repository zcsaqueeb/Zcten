const axios = require('axios');
const chalk = require('chalk');
const WebSocket = require('ws');
const fs = require('fs');
const readline = require('readline');

let sockets = [];
let pingIntervals = [];
let potentialPoints = [];
let countdowns = [];
let pointsTotals = [];
let pointsToday = [];
let lastUpdateds = [];
let messages = [];
let userIds = [];
let browserIds = [];
let accessTokens = [];
let accounts = [];
let currentAccountIndex = 0;

function loadAccounts() {
    if (!fs.existsSync('account.txt')) {
        console.error('account.txt not found. Please add the file with account data.');
        process.exit(1);
    }

    try {
        const data = fs.readFileSync('account.txt', 'utf8');
        accounts = data.split('\n').map(line => {
            const [email, password] = line.split(',');
            if (email && password) {
                return { email: email.trim(), password: password.trim() };
            }
            return null;
        }).filter(account => account !== null);
    } catch (err) {
        console.error('Failed to load accounts:', err);
    }
}

async function initialize() {
    loadAccounts();

    for (let i = 0; i < accounts.length; i++) {
        potentialPoints[i] = 0;
        countdowns[i] = "Calculating...";
        pointsTotals[i] = 0;
        pointsToday[i] = 0;
        lastUpdateds[i] = null;
        messages[i] = '';
        userIds[i] = null;
        browserIds[i] = null;
        accessTokens[i] = null;
        getUserId(i);
    }

    displayAccountData(currentAccountIndex);
    handleUserInput();
}

function generateBrowserId(index) {
    return `browserId-${index}-${Math.random().toString(36).substring(2, 15)}`;
}

function displayAccountData(index) {
    console.clear();
    console.log(chalk.cyan(`\nAccount ${index + 1}`));
    console.log(chalk.whiteBright(`Email: ${accounts[index].email}`));
    console.log(`User ID: ${userIds[index]}`);
    console.log(`Browser ID: ${browserIds[index]}`);
    console.log(chalk.green(`Points Total: ${pointsTotals[index]}`));
    console.log(chalk.green(`Points Today: ${pointsToday[index]}`));
    console.log(chalk.whiteBright(`Message: ${messages[index]}`));
}

function handleUserInput() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log("\nControls: [A] Previous Account | [D] Next Account | [C] Exit");

    rl.on('line', (input) => {
        const key = input.trim().toLowerCase();
        if (key === 'a') {
            currentAccountIndex = (currentAccountIndex - 1 + accounts.length) % accounts.length;
        } else if (key === 'd') {
            currentAccountIndex = (currentAccountIndex + 1) % accounts.length;
        } else if (key === 'c') {
            console.log('Exiting the script...');
            process.exit();
        }
        displayAccountData(currentAccountIndex);
    });
}

async function connectWebSocket(index) {
    if (sockets[index]) return;
    const version = "v0.2";
    const url = "wss://secure.ws.teneo.pro";
    const wsUrl = `${url}/websocket?accessToken=${encodeURIComponent(accessTokens[index])}&version=${encodeURIComponent(version)}`;

    sockets[index] = new WebSocket(wsUrl);

    sockets[index].onopen = async () => {
        lastUpdateds[index] = new Date().toISOString();
        console.log(`Account ${index + 1} Connected`);
        startPinging(index);
    };

    sockets[index].onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.pointsTotal !== undefined && data.pointsToday !== undefined) {
            pointsTotals[index] = data.pointsTotal;
            pointsToday[index] = data.pointsToday;
            messages[index] = data.message;
            if (index === currentAccountIndex) {
                displayAccountData(index);
            }
        }
    };

    sockets[index].onclose = () => {
        console.log(`Account ${index + 1} Disconnected`);
    };

    sockets[index].onerror = (error) => {
        console.error(`WebSocket error for Account ${index + 1}:`, error);
    };
}

function startPinging(index) {
    pingIntervals[index] = setInterval(() => {
        if (sockets[index] && sockets[index].readyState === WebSocket.OPEN) {
            sockets[index].send(JSON.stringify({ type: "PING" }));
        }
    }, 60000);
}

async function getUserId(index) {
    const loginUrl = "https://auth.teneo.pro/api/login";

    try {
        const response = await axios.post(loginUrl, {
            email: accounts[index].email,
            password: accounts[index].password
        }, {
            headers: {
                'Authorization': `Bearer ${accessTokens[index]}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });

        const { user, access_token } = response.data;
        userIds[index] = user.id;
        accessTokens[index] = access_token;
        browserIds[index] = generateBrowserId(index);
        messages[index] = "Connected successfully";

        if (index === currentAccountIndex) {
            displayAccountData(index);
        }

        console.log(`User Data for Account ${index + 1}:`, user);
        await connectWebSocket(index);
    } catch (error) {
        messages[index] = `Error: ${error.message}`;
        if (index === currentAccountIndex) {
            displayAccountData(index);
        }
        console.error(`Error for Account ${index + 1}:`, error.message);
    }
}

initialize();
