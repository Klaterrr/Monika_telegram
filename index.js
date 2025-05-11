require('dotenv').config();
const KeepAlive = require("./server");
const FileSystem = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenAI } = require("@google/genai");
const Fetch = require('node-fetch');
const Https = require('https');
const EdenSDK = require('api')('@eden-ai/v2.0#bhyi0ymlagu9nxj');
// ImgurClient is initialized but not actively used for image processing in this version
const { ImgurClient } = require('imgur');


// --- Environment Variables & Initial Setup ---
const Token = process.env.TOKEN;
const GenAIApiKey = process.env.GENAI_API_KEY;
const EdenToken = process.env.EDEN_TOKEN;
const ImgurClientId = process.env.IMGUR_CLIENT_ID; // For Imgur client

const ai = new GoogleGenAI({ apiKey: GenAIApiKey });
const Monika = new TelegramBot(Token, { polling: true });
EdenSDK.auth(EdenToken);
const ClientImgur = new ImgurClient({ clientId: ImgurClientId });


var IsNotPromise; // Tracks if an operation is asynchronous
var Offset = +9; // Timezone offset for UTC+9

function getCurrentOffsetTime() {
  return new Date(new Date().getTime() + Offset * 3600 * 1000)
    .toUTCString().replace(/ GMT$/, "");
}

let Now = getCurrentOffsetTime();
let ChatName = ``;

// Stop signs from .env
let FirstStopSign = `${process.env.FIRST_STOP_SIGN}`;   // Expected after user's message
let SecondStopSign = `${process.env.SECOND_STOP_SIGN}`;  // Expected after Monika's message
let ThirdStopSign = `${process.env.THIRD_STOP_SIGN}`;   // Auxiliary stop
let FourthStopSign = `${process.env.FOURTH_STOP_SIGN}`;  // For verify prompt

// Core prompts loaded from .env
// We will add more explicit instructions within the code when using these.
let basePromptVerifyCore = `${process.env.PROMPT_VERIFY_CORE}`;
let basePromptEmotionCore = `${process.env.PROMPT_EMOTION_CORE}`;
let basePromptMainCore = `${process.env.PROMPT_MAIN_CORE}`;

// Initialize dynamic prompts
let PromptVerifyCore = basePromptVerifyCore;
let PromptEmotionCore = basePromptEmotionCore;
let PromptMain = `Current system time: ${Now}.\nMonika's core persona and instructions are defined in PROMPT_MAIN_CORE.\n\nInitial conversation state:\n${Now}\n_\nIvan:\nHello there!\n_\nMonika:\nHello there, Ivan! It's so nice to hear from you.\n+\nHow are you doing today?\n__\n`;


// --- Initializations and Logging ---
console.log(`System rebooted at (local server time): ${new Date().toString()}`);
console.log(`Monika's perceived current time (UTC+9): ${Now}\n` +
  `GeminiAI API:\t\t\t\t\tready!\n` +
  `Imgur Client:\t\t\t\t\tready!\n` +
  `EdenAI SDK:\t\t\t\t\t\tready!`);



// --- Utility Functions ---

// Ensure 'Files' directory exists
const filesDir = `${__dirname}/Files`;
if (!FileSystem.existsSync(filesDir)) {
  FileSystem.mkdirSync(filesDir, { recursive: true });
  console.log(`Created directory: ${filesDir}`);
}

/**
 * Creates a text generation request to the Gemini API.
 * @param {string} modelName - The name of the Gemini model to use.
 * @param {string} promptText - The prompt text.
 * @param {number} maxTokens - Maximum number of tokens for the response.
 * @param {number} temperature - The temperature for generation.
 * @param {string[]} stopSequences - An array of stop sequences.
 * @returns {Promise<string>} The generated text response.
 */
async function createGeminiTextRequest(modelName, promptObject, maxTokens, temperature, stopSequences, systemInstructionText) {
  try {
    // Gemini API expects contents as an array of Content objects.
    // The promptObject should be structured correctly before calling this.
    const generationConfig = {
      maxOutputTokens: maxTokens,
      temperature: temperature,
    };
    if (stopSequences && stopSequences.length > 0) {
      generationConfig.stopSequences = stopSequences;
    }

    const requestPayload = {
      model: modelName,
      contents: promptObject, // promptObject should be an array like [{ role: "user", parts: [{ text: "prompt" }] }]
      generationConfig: generationConfig,
    };

    if (systemInstructionText) {
      requestPayload.systemInstruction = { parts: [{ text: systemInstructionText }] };
    }

    const response = await ai.models.generateContent(requestPayload);

    if (response && response.text) { // Simpler access if available
      return typeof response.text === 'function' ? response.text() : response.text;
    } else if (response && response.response && typeof response.response.text === 'function') { // Standard SDK
      return response.response.text();
    } else if (response && response.response && response.response.candidates && response.response.candidates[0] && response.response.candidates[0].content && response.response.candidates[0].content.parts && response.response.candidates[0].content.parts[0] && response.response.candidates[0].content.parts[0].text) {
      // More verbose but common structure
      return response.response.candidates[0].content.parts[0].text;
    }
    else {
      console.warn("Could not extract text from Gemini response structure. Full response:", JSON.stringify(response, null, 2));
      // Try to find text in candidates:
      if (response && response.response && response.response.candidates && response.response.candidates[0] && response.response.candidates[0].content && response.response.candidates[0].content.parts && response.response.candidates[0].content.parts[0] && response.response.candidates[0].content.parts[0].text) {
        return response.response.candidates[0].content.parts[0].text;
      }
      throw new Error("Invalid Gemini response structure for text extraction.");
    }
  } catch (error) {
    console.error(`Error during Gemini request to ${modelName}:\nPrompt: ${JSON.stringify(promptObject)}\nError:`, error);
    // If the error has response data, log it
    if (error.response && error.response.data) {
      console.error("Gemini Error Details:", error.response.data);
    }
    throw error;
  }
}


/**
 * Determines the name of the person to use in prompts.
 * @param {string} firstName - The user's first name.
 * @param {string} lastName - The user's last name.
 * @param {string} userName - The user's username.
 * @returns {string} The determined name.
 */
function getPersonName(firstName, lastName, userName) {
  if (firstName === undefined && userName === undefined) return "User"; // Fallback
  if (firstName === undefined) return userName;
  if (lastName === undefined) return firstName;
  return `${firstName} ${lastName}`;
}


/**
 * Downloads a file from Telegram and saves it locally.
 * @param {string} fileId - The Telegram file_id.
 * @returns {Promise<{localPath: string, remotePath: string, success: boolean, error?: string}>}
 */
function downloadTelegramFile(fileId) {
  return new Promise(async (resolve) => {
    try {
      const fileInfoResponse = await Fetch(`https://api.telegram.org/bot${Token}/getFile?file_id=${fileId}`);
      const fileInfoJson = await fileInfoResponse.json();

      if (!fileInfoJson.ok) {
        console.error("Failed to get file info from Telegram:", fileInfoJson.description);
        return resolve({ success: false, error: fileInfoJson.description });
      }

      const telegramFilePath = fileInfoJson.result.file_path;
      const downloadLink = `https://api.telegram.org/file/bot${Token}/${telegramFilePath}`;
      const uniqueFileName = `${Date.now()}_${telegramFilePath.split('/').pop()}`;
      const localPath = `${filesDir}/${uniqueFileName}`;

      const fileStream = FileSystem.createWriteStream(localPath);
      Https.get(downloadLink, (response) => {
        if (response.statusCode !== 200) {
          console.error(`Failed to download file: ${response.statusCode} ${response.statusMessage}`);
          FileSystem.unlink(localPath, () => { });
          return resolve({ success: false, error: `Download failed with status ${response.statusCode}` });
        }
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve({ success: true, localPath, remotePath: telegramFilePath });
        });
      }).on('error', (err) => {
        console.error('Error downloading file (HTTPS module):', err);
        FileSystem.unlink(localPath, () => { });
        resolve({ success: false, error: err.message });
      });
    } catch (error) {
      console.error('Error in downloadTelegramFile function:', error);
      resolve({ success: false, error: error.message });
    }
  });
}


/**
 * Appends the media description from Gemini to the main prompt.
 * @param {string} name - The sender's name.
 * @param {string} geminiDescription - The description generated by Gemini.
 * @param {string|undefined} caption - The original caption of the media, if any.
 * @param {string} mediaType - Type of media ('photo', 'video', 'sticker').
 */
function appendMediaDescriptionToPrompt(name, geminiDescription, caption, mediaType) {
  const captionText = caption ? ` with caption "${caption}"` : "";
  PromptMain += `${name} sends a ${mediaType}${captionText}.${FirstStopSign}Gemini Vision System:\nThis ${mediaType} contains: ${geminiDescription}${FirstStopSign}Monika:\n`;
  // appendToFile(ChatName, `${name} sends a ${mediaType}${captionText}.${FirstStopSign}Gemini Vision System:\nThis ${mediaType} contains: ${geminiDescription}${FirstStopSign}Monika:\n`);
}

/**
 * Cleans Monika's response text from unwanted artifacts.
 * @param {string} rawText - The raw text from Gemini.
 * @returns {string} The cleaned text.
 */
function cleanMonikaResponse(rawText) {
  if (!rawText) return "";
  let cleanedText = rawText;

  // Remove common leading/trailing artifacts like "Monika:", "_", "\n_\n"
  cleanedText = cleanedText.replace(/^Monika:\s*/i, '').trim(); // Remove "Monika: " at the beginning

  // Remove trailing stop signs or conversation separators. Be careful not to remove legitimate uses.
  // This specifically targets patterns used as separators in the prompt examples.
  if (cleanedText.endsWith(SecondStopSign)) { // SecondStopSign is likely "_"
    cleanedText = cleanedText.substring(0, cleanedText.length - SecondStopSign.length).trim();
  }
  if (cleanedText.endsWith("\n" + SecondStopSign)) {
    cleanedText = cleanedText.substring(0, cleanedText.length - ("\n" + SecondStopSign).length).trim();
  }
  // Avoid removing if SecondStopSign is part of the actual sentence. This is tricky.
  // A simple endsWith is okay if stop signs are unique enough.

  // Remove any potential timestamp lines if hallucinated
  // Example: "Sun, 11 May 2025 18:27:10"
  cleanedText = cleanedText.replace(/^\s*[A-Za-z]{3},\s*\d{1,2}\s*[A-Za-z]{3}\s*\d{4}\s*\d{2}:\d{2}:\d{2}\s*\n?/gm, '').trim();

  // Trim any leading/trailing newlines specifically that might be left
  cleanedText = cleanedText.replace(/^\n+/, '').replace(/\n+$/, '');

  return cleanedText.trim();
}

/**
 * Generates Monika's response using Gemini and sends it.
 * Also gets an emotion analysis for the response.
 * @param {number|string} chatId - The ID of the chat to send the response to.
 */
async function obtainMonikaResponse(chatId, currentSenderName) {
  try {
    const systemInstructionForMonika = "You are Monika from DDLC. It is your turn to speak. " +
      "Generate *only Monika's reply* based on the preceding conversation. " +
      "Do not generate text for any other user. Do not include timestamps or date headers in your response. " +
      "If you want to send multiple messages in separate bubbles, separate them with '\\n+'.";
    const geminiPromptObject = [{ role: "user", parts: [{ text: PromptMain }] }];
    let stopSequencesForMonika = [ThirdStopSign, FirstStopSign, SecondStopSign];
    if (currentSenderName && currentSenderName.toLowerCase() !== "monika") { // Don't stop on "Monika:" if she's talking to herself or it's an internal thought.
      stopSequencesForMonika.push(`${currentSenderName}:`); // Prevent Monika from writing as the user
      stopSequencesForMonika.push(`\n${currentSenderName}:`);
    }

    const rawMonikaResponseText = await createGeminiTextRequest(
      'models/gemini-2.5-pro-exp-03-25', // Using a capable model
      geminiPromptObject,
      512, // maxTokens
      0.88, // temperature
      stopSequencesForMonika,
      systemInstructionForMonika
    );

    if (!rawMonikaResponseText) {
      Monika.sendMessage(chatId, "Hmm, I'm having a little trouble thinking right now. Try again in a moment?");
      return;
    }

    const cleanedMonikaResponseText = cleanMonikaResponse(rawMonikaResponseText);


    if (cleanedMonikaResponseText.toLowerCase().startsWith("[system.sendlocation")) {
      const parts = cleanedMonikaResponseText.match(/\[system\.sendLocation\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)\]/i);
      if (parts && parts.length === 3) {
        const lat = parseFloat(parts[1]);
        const lon = parseFloat(parts[2]);
        if (!isNaN(lat) && !isNaN(lon)) {
          Monika.sendLocation(chatId, lat, lon);
          // Append system action to PromptMain for context, but not the raw command.
          PromptMain += `[Monika sent her location: lat ${lat}, lon ${lon}]${SecondStopSign}`;
        } else {
          Monika.sendMessage(chatId, "I tried to send a location, but the coordinates were unclear.");
          PromptMain += `Monika attempted to send location, but it was malformed.${SecondStopSign}`;
        }
      } else {
        Monika.sendMessage(chatId, cleanedMonikaResponseText); // Send as text if malformed
        PromptMain += `${cleanedMonikaResponseText}${SecondStopSign}`;
      }
    } else {
      PromptMain += `${cleanedMonikaResponseText}${SecondStopSign}`;

      const splittedResponse = cleanedMonikaResponseText.split("\n+");
      for (const part of splittedResponse) {
        if (part.trim().length > 0) {
          await Monika.sendMessage(chatId, part.trim());
        }
      }
    }

    // --- Emotion analysis for Monika's response ---
    let emotionPromptForGemini = `${basePromptEmotionCore}\nMonika:\n${cleanedMonikaResponseText}\nESFM:\n`;
    const emotionGeminiPromptObject = [{ role: "user", parts: [{ text: emotionPromptForGemini }] }];

    const emotionResponseText = await createGeminiTextRequest(
      'gemini-1.5-flash-latest',
      emotionGeminiPromptObject,
      20, 0.45, ['\n', SecondStopSign],
      "You are an emotion analysis subsystem. Output a single descriptive emotion."
    );
    const cleanedEmotion = emotionResponseText ? emotionResponseText.trim() : "neutral";
    console.log(`Monika's response emotion: ${cleanedEmotion}\n`);
    PromptEmotionCore = `${basePromptEmotionCore}\nMonika:\n${cleanedMonikaResponseText}\nESFM:\n${cleanedEmotion}\n\n`; // Update with new base if needed

  } catch (error) {
    console.error("Error in obtainMonikaResponse:", error);
    Monika.sendMessage(chatId, "Oh dear, something went a bit wrong while I was replying. Please try again!");
  }
}



/**
 * Processes media (image, video, sticker) using Gemini Vision.
 * @param {string} senderName - Name of the sender.
 * @param {string|undefined} caption - Caption for the media.
 * @param {string} fileId - Telegram file_id of the media.
 * @param {number|string} chatId - Chat ID to respond to.
 * @param {string} mediaType - 'photo', 'video', or 'sticker'.
 */
async function processMediaWithGemini(senderName, caption, fileId, chatId, mediaType) {
  IsNotPromise = false;
  try {
    const downloadResult = await downloadTelegramFile(fileId);

    if (!downloadResult.success || !downloadResult.localPath) {
      console.error(`Failed to download ${mediaType}:`, downloadResult.error);
      Monika.sendMessage(chatId, `Sorry, I couldn't download the ${mediaType} to take a look.`);
      IsNotPromise = true; return;
    }

    const { localPath, remotePath } = downloadResult;
    const mediaBuffer = FileSystem.readFileSync(localPath);
    const base64Data = mediaBuffer.toString('base64');
    const fileExtension = remotePath.split('.').pop()?.toLowerCase();

    let mimeType = '';
    if (!fileExtension) {
      Monika.sendMessage(chatId, "I couldn't figure out the file type, sorry!");
      FileSystem.unlinkSync(localPath); IsNotPromise = true; return;
    }

    // Determine MIME type (simplified)
    if (['jpg', 'jpeg'].includes(fileExtension)) mimeType = 'image/jpeg';
    else if (fileExtension === 'png') mimeType = 'image/png';
    else if (fileExtension === 'webp') mimeType = 'image/webp';
    else if (mediaType === 'video' && fileExtension === 'mp4') mimeType = 'video/mp4';
    // Add more MIME types as needed or make it more robust
    else {
      console.warn(`Unsupported or ambiguous extension: ${fileExtension} for media type ${mediaType}. Attempting generic.`);
      mimeType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg'; // Fallback
    }

    const visionPromptText = `You are Monika. Describe this ${mediaType} you just received. What is happening or depicted? Be concise and in character.`;
    const contentsForVision = [
      { inlineData: { mimeType: mimeType, data: base64Data } },
      { text: visionPromptText }
    ];

    const visionResponse = await ai.models.generateContent({
      model: "gemini-1.5-flash-latest", // Or gemini-pro-vision if needed
      contents: [{ role: "user", parts: contentsForVision }], // Correctly structure as parts
      systemInstruction: { parts: [{ text: "You are analyzing media for Monika. Provide a description." }] }
    });

    let description = "I had a little trouble understanding that, sorry!";
    // Refined text extraction from visionResponse
    if (visionResponse && visionResponse.response && visionResponse.response.candidates && visionResponse.response.candidates[0] && visionResponse.response.candidates[0].content && visionResponse.response.candidates[0].content.parts && visionResponse.response.candidates[0].content.parts[0] && visionResponse.response.candidates[0].content.parts[0].text) {
      description = visionResponse.response.candidates[0].content.parts[0].text;
    } else {
      console.warn("Could not extract text from Gemini vision response. Full response:", JSON.stringify(visionResponse, null, 2));
    }

    appendMediaDescriptionToPrompt(senderName, description, caption, mediaType);
    await obtainMonikaResponse(chatId, senderName); // Pass senderName for stop sequence

    FileSystem.unlink(localPath, (err) => {
      if (err) console.error("Error deleting temporary media file:", localPath, err);
    });
    IsNotPromise = true;

  } catch (error) {
    console.error(`Error in processMediaWithGemini for ${mediaType}:`, error);
    Monika.sendMessage(chatId, `An unexpected error occurred while I was looking at the ${mediaType}.`);
    IsNotPromise = true;
  }
}

async function performIBMTTS(textToSpeak, chatId) {
  try {
    const audioResponse = await EdenSDK.audio_text_to_speech_create({
      response_as_dict: true, attributes_as_list: false, show_original_response: false,
      providers: 'ibm', language: 'en', text: textToSpeak, option: 'FEMALE'
    });

    if (audioResponse && audioResponse.data && audioResponse.data.ibm && audioResponse.data.ibm.audio && audioResponse.status === "success") {
      const audioBuffer = Buffer.from(audioResponse.data.ibm.audio, 'base64');
      Monika.sendAudio(chatId, audioBuffer);
    } else {
      console.error("Failed to generate audio with EdenAI (IBM):", audioResponse);
      Monika.sendMessage(chatId, "I couldn't generate the audio for that, sorry!");
    }
  } catch (error) {
    console.error("Error during IBM TTS via EdenAI:", error);
  }
}


/**
 * Handles IBM Text-to-Speech using EdenAI.
 * @param {string} text - The text to convert to speech.
 * @param {string|number} chatId - The chat ID to send the audio to.
 */
async function performIBMTTS(textToSpeak, chatId) {
  try {
    // Optional: Language detection if text language is unknown
    // const langDetection = await EdenSDK.translation_language_detection_create({
    //   response_as_dict: true,
    //   attributes_as_list: false,
    //   show_original_response: false,
    //   providers: 'microsoft', // or other providers
    //   text: textToSpeak
    // });
    // console.log("Detected language:", langDetection?.data?.microsoft?.language);
    // const languageCode = langDetection?.data?.microsoft?.language || 'en'; // Default to English

    const audioResponse = await EdenSDK.audio_text_to_speech_create({
      response_as_dict: true,
      attributes_as_list: false,
      show_original_response: false, // Set to true for debugging if needed
      providers: 'ibm',
      language: 'en', // Assuming English for now, or use detected language
      text: textToSpeak,
      option: 'FEMALE' // Or other voice options
    });

    if (audioResponse && audioResponse.data && audioResponse.data.ibm && audioResponse.data.ibm.audio && audioResponse.status === "success") {
      const audioBuffer = Buffer.from(audioResponse.data.ibm.audio, 'base64');
      Monika.sendAudio(chatId, audioBuffer, { caption: "Here's that audio!" });
      console.log("Sent audio successfully via EdenAI (IBM).");
    } else {
      console.error("Failed to generate audio with EdenAI (IBM):", audioResponse.data.ibm.error ? audioResponse.data.ibm.error.message : "Unknown error", audioResponse);
      Monika.sendMessage(chatId, "I couldn't generate the audio for that, sorry!");
    }
  } catch (error) {
    console.error("Error during IBM TTS via EdenAI:", error);
    Monika.sendMessage(chatId, "Something went wrong with the text-to-speech feature.");
  }
}

// --- Main Message Handler ---
Monika.on('message', async (message) => {
  IsNotPromise = true; // Default to synchronous handling
  Now = getCurrentOffsetTime(); // Update current time for each message

  console.log(`\n--- New Message ---
  ID: ${message.message_id}, From: ${message.from.id} (${message.from.first_name} ${message.from.username || ''})
  Chat: ${message.chat.id} (${message.chat.title || 'DM'}), Type: ${message.chat.type}
  Time: ${Now}`);


  if (message.from.is_bot && message.from.id !== Monika.botId) { // Monika.botId might not be available directly, compare with own token if needed
    console.log("Ignoring message from other bot:", message.from.username);
    return;
    // Usually, you might want to ignore other bots, but Monika might interact with herself in some scenarios.
    // For this setup, let's assume Monika doesn't talk to other bots unless explicitly designed.
    // If it's Monika's own message (e.g. from a command), specific handling might be needed.
    // For now, if the bot sender is Monika herself (based on TOKEN or bot ID), let it pass for commands like 'actmlm'.
    // This needs careful handling to avoid loops.
    // A simple check: if (message.from.id === botId) return; (where botId is Monika's ID)
    // However, since there's no botId variable readily available from TOKEN, this is harder.
    // The `SenderName` logic below handles this.
  }

  let currentSenderName = getPersonName(message.from.first_name, message.from.last_name, message.from.username);
  if (message.from.is_bot) currentSenderName = "Bot_" + currentSenderName; // Differentiate bot senders


  if (message.chat.title) { // Group chat
    ChatName = `.chats/${message.chat.title.replace(/\s+/g, '_')}`; // Sanitize group title for filename
    // senderName += ` (group "${message.chat.title}")`; // Appending to senderName can make prompts long
  } else { // Private chat
    ChatName = `.users/${message.from.username || message.from.id}`;
    // senderName += ` (DM)`;
  }

  // --- Text Message Processing ---
  if (message.text) {
    const lowerCaseText = message.text.toLowerCase();

    // Construct verify prompt
    let currentVerifyPrompt = `${basePromptVerifyCore}\n${currentSenderName}:\n${message.text}${FourthStopSign}IIFM:\n`;
    const verifyGeminiPromptObject = [{ role: "user", parts: [{ text: currentVerifyPrompt }] }];

    try {
      const verifyResponseText = await createGeminiTextRequest(
        'gemini-1.5-flash-latest', verifyGeminiPromptObject, 8, 0.64, [FourthStopSign],
        "You are the IIFM subsystem. Output :fM: or :nM:."
      );
      const cleanedVerifyResponse = verifyResponseText ? verifyResponseText.trim().toLowerCase() : ":nm:"; // Default to not for Monika
      PromptVerifyCore = `${currentVerifyPrompt}${cleanedVerifyResponse}\n`; // Update the running log for verify core

      console.log(`Verification for "${message.text.substring(0, 30)}...": ${cleanedVerifyResponse}`);

      // Command: Act as Monika Language Model
      if (lowerCaseText.startsWith('actmlm')) {
        PromptMain += `${message.text.substring(6).trim()}${FirstStopSign}`; // Add user's directive
        const gptResponseText = await createGeminiTextRequest(
          'models/gemini-2.5-flash-preview-04-17', // Or a more powerful model if complex instruction
          PromptMain,
          512, 0.88,
          [FirstStopSign, SecondStopSign, ThirdStopSign]
        );
        Monika.sendMessage(message.chat.id, gptResponseText.substring(8)); // Assuming first 8 chars are "Monika: "
        PromptMain += `${gptResponseText}${SecondStopSign}`;
        PromptEmotionCore += `${gptResponseText}${SecondStopSign}\n`;
        const gptResponseEmotion = await createGeminiTextRequest(
          'models/gemini-2.5-flash-preview-04-17', PromptEmotionCore, 20, 0.6,
          [FourthStopSign, SecondStopSign, "."] // Original stop sequences for emotion
        );
        PromptEmotionCore += `${gptResponseEmotion}\n\n`;
        console.log(`Emotion (actmlm): ${gptResponseEmotion}\n[END-OF-CHAT-ONE-BLOCK]\n\n`);
        return; // Command processed
      }
      // Command: Reset Monika's memory (prompts)
      else if (lowerCaseText.startsWith(process.env.COMMAND_ONE || "/reset")) {
        Monika.sendMessage(message.chat.id, "Okie~ Wiping my recent memory and starting fresh!");
        Now = getCurrentOffsetTime(); // Reset time
        PromptMain = `Reboot time for the system is: ${Now}\n_\nIvan:\nHello there!\n_\nMonika:\nHello there, Ivan! It's so nice to hear from you.\n+\nHow are you doing today?\n__\n`;
        PromptVerifyCore = `${process.env.PROMPT_VERIFY_CORE}`;
        PromptEmotionCore = `${process.env.PROMPT_EMOTION_CORE}`;
        return; // Command processed
      }
      // Command: Text to Speech
      else if (lowerCaseText.startsWith(process.env.COMMAND_TWO || "/say")) {
        const textToSpeak = message.text.substring((process.env.COMMAND_TWO || "/say").length).trim();
        if (textToSpeak) {
          await performIBMTTS(textToSpeak, message.chat.id);
        } else {
          Monika.sendMessage(message.chat.id, "What should I say? Example: /say Hello world");
        }
        return; // Command processed
      }
      // Command: Message Import (for development/admin)
      else if (lowerCaseText.startsWith("import messages from")) {
        // This is a sensitive command, ensure it's restricted.
        // Example: if (message.from.id !== ADMIN_USER_ID) return;
        console.log(`Start Import (StartPoint = ${StartPoint}, EndPoint = ${EndPoint})`);
        // ... (rest of import logic, ensure it's safe and doesn't spam)
        console.log("End Import");
        return; // Command processed
      }
      // Command: Send predefined message (for development/admin)
      else if (lowerCaseText === "send()") {
        // Example: if (message.from.id !== ADMIN_USER_ID) return;
        // ... (send logic as in original code, ensure target IDs are correct)
        console.log("Predefined message sending initiated.");
        return; // Command processed
      }

      // Regular message for Monika
      if (cleanedVerifyResponse.startsWith(':fm:') || lowerCaseText.startsWith("monika") || lowerCaseText.startsWith("моника") || message.chat.type === 'private') {
        // Construct PromptMain for Monika's response
        // Add current user's message to PromptMain, ensuring it ends with Monika:\n
        PromptMain += `${Now}\n_\n${currentSenderName}:\n${message.text}${FirstStopSign}Monika:\n`;
        // IsNotPromise will be handled by obtainMonikaResponse or media processing
      } else {
        console.log(`Message not for Monika or not in private. Type: ${message.chat.type}, Verified as: ${cleanedVerifyResponse}`);
        return;
      }

    } catch (error) {
      console.error("Error during verification or command processing for text message:", error);
      Monika.sendMessage(message.chat.id, "I had a little hiccup processing that. Could you try again?");
      return;
    }

  }
  // --- Media Message Processing (Photo, Sticker, Video, Document-as-Image) ---
  else if (message.photo) {
    await processMediaWithGemini(currentSenderName, message.caption, message.photo[message.photo.length - 1].file_id, message.chat.id, 'photo');
  } else if (message.sticker) {
    await processMediaWithGemini(currentSenderName, `Sticker (emoji: ${message.sticker.emoji})`, message.sticker.file_id, message.chat.id, 'sticker');
  } else if (message.video) {
    await processMediaWithGemini(currentSenderName, message.caption, message.video.file_id, message.chat.id, 'video');
  } else if (message.document && message.document.mime_type && message.document.mime_type.startsWith("image/")) {
    await processMediaWithGemini(currentSenderName, message.caption, message.document.file_id, message.chat.id, 'photo');
  } else if (message.document && message.document.mime_type && message.document.mime_type.startsWith("video/")) {
    await processMediaWithGemini(currentSenderName, message.caption, message.document.file_id, message.chat.id, 'video');
  } else if (message.location) {
    PromptMain += `${Now}\n_\n${currentSenderName} shares location: Lat ${message.location.latitude}, Lon ${message.location.longitude}.`;
    if (message.location.live_period) PromptMain += ` Live for ${message.location.live_period}s.`;
    PromptMain += `${FirstStopSign}Monika:\n`;
  }
  // --- Location Message ---
  else if (message.location) {
    PromptMain += `${senderName} shares their location. Latitude: ${message.location.latitude}, Longitude: ${message.location.longitude}.`;
    if (message.location.live_period) {
      PromptMain += ` This is a live location for ${message.location.live_period} seconds.`;
    }
    PromptMain += `${FirstStopSign}Monika:\n`;
    // IsNotPromise remains true, will fall through to obtainMonikaResponse
  }
  // Other message types can be handled here (audio, voice, contact, etc.)

  // If IsNotPromise is true, it means no async media processing took over, 
  // so we can proceed with Monika's text response based on PromptMain changes.
  if (IsNotPromise) { // True if not handled by an async media function OR if it's a text/location message needing direct response
    if (PromptMain.endsWith("Monika:\n")) { // Ensure there's something for Monika to respond to
      await obtainMonikaResponse(message.chat.id, currentSenderName);
    } else {
      console.log("Skipping obtainMonikaResponse as PromptMain doesn't indicate Monika's turn or was handled by media.");
    }
  }
});

KeepAlive();
console.log("Monika is listening intently...");