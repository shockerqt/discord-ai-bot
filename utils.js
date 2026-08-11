import 'dotenv/config';
import { verifyKey } from 'discord-interactions';

export async function DiscordRequest(endpoint, options) {
  // append endpoint to root API URL
  const url = 'https://discord.com/api/v10/' + endpoint;

  // Los adjuntos van como multipart: en ese caso fetch pone el boundary solo
  const isMultipart = options.body instanceof FormData;
  if (options.body && !isMultipart) options.body = JSON.stringify(options.body);

  const headers = {
    Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
    'User-Agent': 'DiscordBot (https://github.com/discord/discord-example-app, 1.0.0)',
  };
  if (!isMultipart) headers['Content-Type'] = 'application/json; charset=UTF-8';

  // Use fetch to make requests
  const res = await fetch(url, { headers, ...options });

  // throw API errors — el cuerpo no siempre es JSON (proxies, 5xx de gateway),
  // así que se lee como texto para no enmascarar el error real con un SyntaxError
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`[DiscordRequest] ${options.method || 'GET'} ${endpoint} → ${res.status}`);
    throw new Error(`Discord API ${res.status}: ${detail.slice(0, 500)}`);
  }
  // return original response
  return res;
}

export async function InstallGlobalCommands(appId, commands) {
  // API endpoint to overwrite global commands
  const endpoint = `applications/${appId}/commands`;

  try {
    // This is calling the bulk overwrite endpoint: https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
    await DiscordRequest(endpoint, { method: 'PUT', body: commands });
  } catch (err) {
    console.error(err);
  }
}

// Simple method that returns a random emoji from list
export function getRandomEmoji() {
  const emojiList = ['😭', '😄', '😌', '🤓', '😎', '😤', '🤖', '😶‍🌫️', '🌏', '📸', '💿', '👋', '🌊', '✨'];
  return emojiList[Math.floor(Math.random() * emojiList.length)];
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function VerifyDiscordRequest(clientKey) {
  return function (req, res, buf, encoding) {
    const signature = req.get('X-Signature-Ed25519');
    const timestamp = req.get('X-Signature-Timestamp');

    const isValidRequest = verifyKey(buf, signature, timestamp, clientKey);
    if (!isValidRequest) {
      res.status(401).send('Bad Request Signature');
      throw new Error('Bad Request Signature');
    }
  };
}
