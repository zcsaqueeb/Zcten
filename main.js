const axios = require('axios');
const chalk = require('chalk');
const WebSocket = require('ws');
const fs = require('fs');
const readline = require('readline');
const keypress = require('keypress');

let sockets = [];
let pingIntervals = [];
let countdownIntervals = [];
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
let enableAutoRetry = false;
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

function promptEnableAutoRetry() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Do you want to enable auto-retry for account errors? (y/n): ', (answer) => {
      enableAutoRetry = answer.toLowerCase() === 'y';
      rl.close();
      resolve();
    });
  });
}

async function initialize() {
  loadAccounts();
  await promptEnableAutoRetry();

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
  console.log(chalk.cyan(`Account ${index + 1}`));
  console.log(chalk.whiteBright(`Email: ${accounts[index].email}`));
  console.log(`User ID: ${userIds[index]}`);
  console.log(`Browser ID: ${browserIds[index]}`);
  console.log(chalk.green(`Points Total: ${pointsTotals[index]}`));
  console.log(chalk.green(`Points Today: ${pointsToday[index]}`));
  console.log(chalk.whiteBright(`Message: ${messages[index]}`));
  console.log("\nStatus:");
  console.log(`Potential Points: ${potentialPoints[index]}, Countdown: ${countdowns[index]}`);
}

function handleUserInput() {
  keypress(process.stdin);

  process.stdin.on('keypress', (ch, key) => {
    if (key && key.name === 'a') {
      currentAccountIndex = (currentAccountIndex - 1 + accounts.length) % accounts.length;
      displayAccountData(currentAccountIndex);
    } else if (key && key.name === 'd') {
      currentAccountIndex = (currentAccountIndex + 1) % accounts.length;
      displayAccountData(currentAccountIndex);
    } else if (key && key.name === 'c') {
      console.log('Exiting the script...');
      process.exit();
    }
  });

  process.stdin.setRawMode(true);
  process.stdin.resume();
}

async function connectWebSocket(index) {
  if (sockets[index]) return;
  const version = "v0.2";
  const url = `wss://secure.ws.teneo.pro/websocket?accessToken=${encodeURIComponent(accessTokens[index])}&version=${encodeURIComponent(version)}`;

  sockets[index] = new WebSocket(url);

  sockets[index].onopen = async () => {
    lastUpdateds[index] = new Date().toISOString();
    console.log(`Account ${index + 1} Connected`);
    startPinging(index);
    startCountdownAndPoints(index);
  };

  sockets[index].onmessage = async (event) => {
    const data = JSON.parse(event.data);
    if (data.pointsTotal !== undefined && data.pointsToday !== undefined) {
      lastUpdateds[index] = new Date().toISOString();
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

function startCountdownAndPoints(index) {
  clearInterval(countdownIntervals[index]);
  updateCountdownAndPoints(index);
  countdownIntervals[index] = setInterval(() => updateCountdownAndPoints(index), 1000);
}

async function updateCountdownAndPoints(index) {
  const now = new Date();
  if (lastUpdateds[index]) {
    const nextHeartbeat = new Date(lastUpdateds[index]);
    nextHeartbeat.setMinutes(nextHeartbeat.getMinutes() + 15);
    const diff = nextHeartbeat.getTime() - now.getTime();

    if (diff > 0) {
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      countdowns[index] = `${minutes}m ${seconds}s`;

      const maxPoints = 25;
      const timeElapsed = now.getTime() - new Date(lastUpdateds[index]).getTime();
      const timeElapsedMinutes = timeElapsed / (60 * 1000);
      let newPoints = Math.min(maxPoints, (timeElapsedMinutes / 15) * maxPoints);
      newPoints = parseFloat(newPoints.toFixed(2));
      potentialPoints[index] = newPoints;
    }
  } else {
    countdowns[index] = "Calculating...";
    potentialPoints[index] = 0;
  }

  if (index === currentAccountIndex) {
    displayAccountData(index);
  }
}

function startPinging(index) {
  pingIntervals[index] = setInterval(async () => {
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
        'Content-Type': 'application/json',
        'x-api-key': 'OwAG3kib1ivOJG4Y0OCZ8lJETa6ypvsDtGmdhcjB',
        'origin': 'https://dashboard.teneo.pro',
        'referer': 'https://dashboard.teneo.pro/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
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

    startCountdownAndPoints(index);
    await connectWebSocket(index);
  } catch (error) {
    console.error(`Error for Account ${index + 1}:`, error.response ? error.response.data : error.message);
    messages[index] = `Error: ${error.message}`;
    if (index === currentAccountIndex) {
      displayAccountData(index);
    }
    if (enableAutoRetry) {
      setTimeout(() => getUserId(index), 180000);
    }
  }
}

initialize();
