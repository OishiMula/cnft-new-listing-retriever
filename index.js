// Add required libs
const fs = require('fs');
const fetch = require('cross-fetch');
const { MessageEmbed } = require('discord.js');
require('console-stamp')(console, {
  format: ':date(mm/dd/yyyy hh:MM:ss TT)',
});

// ipfs image retrival, botIcon to set an embed icon and filepath saves information across shutdowns
const ipfsBase = 'https://infura-ipfs.io/ipfs/';
const botIcon = 'https://i.postimg.cc/rp7LYmZM/unknown.png';
const FILEPATH = 'lastListing.txt';
const blockfrostURL = 'https://cardano-mainnet.blockfrost.io/api/v0/assets/';
const jpgStoreURL = 'https://www.jpg.store/asset/';

// Create Discord client Instance
const { Client, Intents } = require('discord.js');

const discordIntents = new Intents();
discordIntents.add(Intents.FLAGS.GUILDS);
const client = new Client({ intents: discordIntents });

// dotenv to save keys / information
require('dotenv').config();

const token = process.env.TOKEN;
const projectName = process.env.PROJECT_NAME;
const listChannel = client.channels.cache.get(process.env.DISCORD_LISTING_CHANNEL);
const projectAPI = `https://server.jpgstoreapis.com/policy/${process.env.POLICY_ID}/listings?page=1`;

// Functions
// prepares an embed message to be sent
function createMsg(payload) {
  const author = {
    name: `${projectName} Bot`,
    iconURL: `${botIcon}`,
  };

  let footer;
  switch (payload.mp) {
    case 'jpg': {
      footer = { text: 'Data provided by jpg.store' };
      break;
    }
    default:
      break;
  }

  const color = '#4627E0';
  const newMessage = new MessageEmbed()
    .setTitle(payload.title)
    .setThumbnail(payload.thumbnail)
    .setColor(color)
    .setAuthor(author)
    .setFooter(footer)
    .addField(payload.projectName, payload.content);
  return newMessage;
}

// timeout
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// write to a file on the local disk the last asset posted
async function writeRecentlyPosted(data, file) {
  fs.writeFileSync(file, JSON.stringify(data), (err) => {
    if (err) console.log(err);
  });
}

client.once('ready', async () => {
  console.log(`${projectName} - Listings Discord Bot Ready!`);
  // If file not found, will create a file with the most recent sale
  if (!fs.existsSync(FILEPATH)) {
    console.log('File not Found! Creating lastListing');
    const dataFirstLoad = await fetch(projectAPI);
    const firstListing = await dataFirstLoad.json();
    await writeRecentlyPosted(firstListing[7], FILEPATH);
  }

  // Begin the listings monitor
  for (;;) {
    // Retrieve the dates from last listing & current listing on jpg.store
    const lastListing = await JSON.parse(fs.readFileSync(FILEPATH, 'utf8'));
    const currentListingR = await fetch(projectAPI);
    const currentListing = await currentListingR.json();
    const fileDate = lastListing.listed_at;

    for (let num = 0; ;num += 1) {
      const currentDate = currentListing[num].listed_at;
      if (currentDate > fileDate) continue;
      else if (num > 0) {
        num -= 1;
        for (; num >= 0; num -= 1) {
          // Retrieve asset image from blockchain
          const header = {
            project_id: `${process.env.BLOCKFROST_TOKEN}`,
          };
          const blockfrostR = await fetch(`${blockfrostURL}${currentListing[num].asset_id}`, {
            headers: header,
          });
          const blockfrostJ = await blockfrostR.json();
          const imgURL = blockfrostJ.onchain_metadata.image.slice(7);

          // Create message payload
          const msgPayload = {
            title: 'New Listing',
            mp: 'jpg',
            projectName: `${projectName}`,
            content: `**${currentListing[num].display_name}** was just listed for **₳${Number(currentListing[num].price_lovelace / 1000000)}**
            [direct link to jpg.store](${jpgStoreURL}${currentListing[num].asset_id})`,
            thumbnail: `${ipfsBase}${imgURL}`,
          };

          const embed = await createMsg(msgPayload);
          //listChannel.send({ embeds: [embed] });
          console.log(`Posted: ${currentListing[num].display_name} - ₳${Number(currentListing[num].price_lovelace / 1000000)}`);
          await delay(500);
        }
        await writeRecentlyPosted(currentListing[num + 1], FILEPATH);
        break;
      } else {
        break;
      }
    }
    await delay(5000);
  }
});

client.login(token);
