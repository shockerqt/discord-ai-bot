import 'dotenv/config';
import { spawn, exec } from 'child_process';

const APP_ID = process.env.APP_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!APP_ID || !DISCORD_TOKEN) {
    console.error('Error: APP_ID or DISCORD_TOKEN is missing in .env');
    process.exit(1);
}

console.log('Starting ngrok...');
const ngrok = spawn('ngrok', ['http', '3000'], { stdio: 'pipe' });

ngrok.stdout.on('data', (data) => {
    console.log(`ngrok info: ${data}`);
});

ngrok.stderr.on('data', (data) => {
    console.error(`ngrok error: ${data}`);
});

ngrok.on('close', (code) => {
    console.log(`ngrok exited with code ${code}`);
});

async function getNgrokUrl() {
    const retries = 10;
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch('http://127.0.0.1:4040/api/tunnels');
            if (response.ok) {
                const data = await response.json();
                const tunnel = data.tunnels.find(t => t.proto === 'https');
                if (tunnel) {
                    return tunnel.public_url;
                }
            }
        } catch (err) {
            // Ignore errors and retry
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return null;
}

async function updateDiscordEndpoint(url) {
    const endpoint = `${url}/interactions`;
    console.log(`Updating Discord Interactions Endpoint to: ${endpoint}`);

    try {
        const response = await fetch(`https://discord.com/api/v10/applications/${APP_ID}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bot ${DISCORD_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                interactions_endpoint_url: endpoint,
            }),
        });

        if (response.ok) {
            console.log('Successfully updated Discord Interactions Endpoint!');
        } else {
            const errorText = await response.text();
            console.error('Failed to update Discord Endpoint:', response.status, errorText);
        }
    } catch (err) {
        console.error('Error updating Discord Endpoint:', err);
    }
}

async function openBrowser() {
    const url = `https://discord.com/developers/applications/${APP_ID}/information`;
    console.log(`Opening browser to: ${url}`);
    const startCommand = process.platform === 'win32' ? 'start' : 'open';
    exec(`${startCommand} ${url}`);
}

(async () => {
    const url = await getNgrokUrl();
    if (url) {
        console.log(`ngrok is running at: ${url}`);
        await updateDiscordEndpoint(url);
        await openBrowser();
    } else {
        console.error('Failed to retrieve ngrok URL. Is ngrok running?');
        // We don't exit here to keep ngrok running just in case, but usually if we can't get URL it might be bad.
        // However, if the user manually restarts ngrok, we want this script to be doing its thing. 
        // Actually, if we can't get the URL after retries, we usually stop trying to update.
        // But ngrok process is still alive.
    }
})();
