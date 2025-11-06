const https = require('https');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { CronJob: cronJob } = require('cron');
const { promisify } = require('util');
const { Telegraf } = require('telegraf');
// const { readFile } = require('node:fs/promises');

function get_minutes_offset(date0, date1)
{
  return (date1.getTime() - date0.getTime()) / 60000;
}

const timeframe = 30; // minutes
const double_exp_mutator = 'Double XP'
const base_url = 'https://doublexp.net';
const fetch_missions_async = promisify((when, callback) => {
  https.get(`${base_url}/json?data=${when}`, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      try
      {
        callback(null, JSON.parse(data));
      }
      catch (err)
      {
        console.error('Error while parsing JSON data:', err);
        callback(err);
      }
    });
  }).on('error', (err) => {
    console.error(`Can\'t fetch \'${when}\' missions data. Error:`, err.message);
    callback(err);
  });
});
async function query_doublexp_async(when)
{
    const data = await fetch_missions_async(when);
    //const data = JSON.parse(await readFile(path.resolve('./test.json')));
    //console.log(data);

    let missions = [];
    for (const entry of Object.entries(data.Biomes))
    {
      for (const m of entry[1])
      {
        if (m.MissionMutator != double_exp_mutator)
          continue;

        missions.push({
          ...m,
          Biome: entry[0]
        });
      }
    }
    return { 
      missions,
      timestamp: data.timestamp
    };
}

const db = new sqlite3.Database(path.join(process.env.DATA_DIR ?? "./", 'db.sqlite3'), (err) => {
  if (err) {
    console.error('DB connection error:', err.message);
  } else {
    console.log('SQLite DB connection established');
    db.run(`
      CREATE TABLE IF NOT EXISTS chats (
        chat_id INTEGER PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
});
function registerChat(chatId) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR IGNORE INTO chats (chat_id) VALUES (?)',
      [chatId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
          console.log(`registerChat: ${chatId}`);
        }
      }
    );
  });
}
function unregisterChat(chatId) {
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM chats WHERE chat_id = ?',
      [chatId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
          console.log(`unregisterChat: ${chatId}`);
        }
      }
    );
  });
}
function getAllChatIds() {
  return new Promise((resolve, reject) => {
    db.all('SELECT chat_id FROM chats', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        const ids = rows.map(row => row.chat_id);
        resolve(ids);
      }
    });
  });
}

const bot = new Telegraf(process.env.BOT_TOKEN);
function add_signature(message)
{
  return message + `\n\n${base_url}`;
}
function get_mission_formatted_tg(mission)
{
  const past_season = !mission.included_in.includes('s0') ? ' (_past season_)' : '';
  let desc = `*${mission.Biome}: ${mission.CodeName}${past_season}*
Cave: *${mission.Complexity}*
Length: *${mission.Length}*
Objectives:
  - *${mission.PrimaryObjective}*
  - *${mission.SecondaryObjective}*
`;
  const warnings = mission.MissionWarnings;
  if (Array.isArray(warnings) && warnings.length > 0)
  {
    desc += `Warnings:
${warnings.map((w) => `  - *${w}*`).join('\n')}
`;
  }
  return desc;
}
function send_upcoming_missions_to(chatId, missions, timestamp)
{
  const minutes = Math.round(get_minutes_offset(new Date(), new Date(timestamp)));
  let msg = `Ready up miners! *${double_exp_mutator}* mission`
  if (missions.length > 1)
    msg += 's';
  msg += ` in ${minutes} minutes.\n\n`;
  msg += missions.map((m) => get_mission_formatted_tg(m)).join('\n');
  bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' })
    .catch((err) => {
      console.error(`Failed to send in chat '${chatId}':`, err);
    });
}
bot.start(async (ctx) => {
  const chatId = ctx.chat.id;
  const title = 'Deep Rock Galactic Alerts';
  try {
    await registerChat(chatId);
    ctx.reply(
      `${title}.\n\nWelcome miner!\n` +
      `You\'ll be notified of ${double_exp_mutator} missions upcoming.`
    );
  }
  catch (err) {
    console.error(`Chat ${charId} registration error:`, err);
    ctx.reply(
      `${title}.\n\nChat registration error. Give it another try later.`);
  }

  try
  {
    const { missions, timestamp } = await query_doublexp_async('next');
    if (!Array.isArray(missions) || !missions.length)
      return;

    send_upcoming_missions_to(chatId, missions, timestamp);
  }
  catch (err) {
    console.error(err)
  }
});
bot.command('stop', async (ctx) => {
  const chatId = ctx.chat.id;
  try
  {
    await unregisterChat(chatId);
    ctx.reply(`Gotcha! Stopped notifying ${double_exp_mutator} missions.`);
  }
  catch (err) {
    console.error(err);
    ctx.reply(add_signature(`Failed to stop notifying ${double_exp_mutator} missions.`));
  }
});
bot.command('current', async (ctx) => {
  try
  {
    const { missions, timestamp } = await query_doublexp_async('current');
    if (!Array.isArray(missions) || !missions.length)
    {
      ctx.reply(add_signature(`No ${double_exp_mutator} missions at the moment.`));
      return;
    }

    const minutes = Math.max(0, Math.round(timeframe - get_minutes_offset(new Date(timestamp), new Date())));
    ctx.replyWithMarkdown(`*${double_exp_mutator}* missions for next *${minutes}* minutes are:\n\n`
      + missions.map((m) => get_mission_formatted_tg(m)).join('\n'));
  }
  catch (err) {
    console.error(err);
    ctx.reply(add_signature(`Error while fetching ${double_exp_mutator} missions data.`));
  }
});
bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

const job_check_doublexp = cronJob.from({
  cronTime: `7 */${timeframe} * * * *`,
  onTick: async () => {
    try {
      const { missions, timestamp } = await query_doublexp_async('next');
      if (!Array.isArray(missions) || !missions.length)
        return;

      const chatIds = await getAllChatIds();
      chatIds.forEach((chatId) => {
        send_upcoming_missions_to(chatId, missions, timestamp);
      });
    }
    catch (err) {
      console.error(err);
    }
  },
  start: true,
  timeZone: 'utc'
});
