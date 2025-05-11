require('dotenv').config();                                       //
const KeepAlive = require("./server");                            // Server 
const { spawn } = require('child_process');                       //
const MonikaConfig = `./config.json`;                             // Connect Config file
const FileSystem = require('fs');                                 // Define
const TelegramBot = require('node-telegram-bot-api');             // 
const GoogleTTS = require('@google-cloud/text-to-speech');        // Connect to Google cloud
const { GoogleGenAI } = require("@google/genai");                 //
const Fetch = require('node-fetch');                              //
const Https = require('https');                                   //
const Sharp = require('sharp');                                   //
const { ImgurClient } = require('imgur');                                   //
const EdenSDK = require('api')('@eden-ai/v2.0#bhyi0ymlagu9nxj');  //
const Request = require('request').defaults({ encoding: null });  //
const { ClarifaiStub, grpc } = require("clarifai-nodejs-grpc");   //
const Token = process.env.TOKEN;
const Stub = ClarifaiStub.grpc();
const ai = new GoogleGenAI({ apiKey: process.env.GENAI_API_KEY });
const Monika = new TelegramBot(Token, { polling: true });
const Metadata = new grpc.Metadata();
const ClientImgur = new ImgurClient({
  clientId: process.env.IMGUR_CLIENT_ID,
  clientSecret: process.env.IMGUR_CLIENT_SECRET,
  accessToken: process.env.IMGUR_ACCESS_TOKEN,
});


var ImageMethod;
var IsNotPromise;
var StartPoint = 2001;
var EndPoint = 3000;
var Offset = +9;
var Now = new Date(new Date().getTime() + Offset * 3600 * 1000)
  .toUTCString().replace(/ GMT$/, "");

let Type;
let Link = ``;
let ChatName = ``;
let FirstStopSign = `${process.env.FIRST_STOP_SIGN}`;
let SecondStopSign = `${process.env.SECOND_STOP_SIGN}`;
let ThirdStopSign = `${process.env.THIRD_STOP_SIGN}`;
let FourthStopSign = `${process.env.FOURTH_STOP_SIGN}`;
let PromptVerifyCore = `${process.env.PROMPT_VERIFY_CORE}`;
let PromptEmotionCore = `${process.env.PROMPT_EMOTION_CORE}`;
let PromptMain = `Rebot time for the system have this time:\n\
${Now}\n${process.env.PROMPT_MAIN_CORE}\n${Now}\n_\nIvan:\n\
Hello there!\n_\nMonika:\nHello there, Ivan! It's so nice to hear from you.\n+\nHow are you doing today?\n__\n`;


EdenSDK.auth(process.env.EDEN_TOKEN);
console.log(`Reboot time for this system is ${Now}\n\
GeminiAIApi:\t\t\t\t\t\tready!\nClientImgur:\t\t\t\t\tready!\n\
GoogleTTS.protos.google.api:\tready!`);
AuthoriseImgur();
Metadata.set("authorization", `Key ${process.env.CLARIFY_TOKEN}`);


async function ImageToText(Name, Message, ChatId, IsNotLink, InputImage) {
  if (IsNotLink) {
    const ImageBytes = await FileSystem.readFileSync(`${InputImage}`);
    ImageMethod = { data: { image: { base64: ImageBytes } } }
  } else {
    ImageMethod = { data: { image: { url: InputImage } } }
  }
  Request.get(InputImage, function(Error, Response, Body) {
    if (!Error && Response.statusCode == 200) {
      Data = "data:" + Response.headers["content-type"] + ";base64," +
        Buffer.from(Body).toString('base64');
      fetch("https://nielsr-comparing-captioning-models.hf.space/run/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [Data,] })
      })
        .then(Respond => Respond.json())
        .then(Respond => {
          if (Respond.data) {
            console.log(Respond.data[3]);
            GetTextImage(Name, Respond.data[3], Message);
            ObtainMonikaResponse(ChatId);
          } else {
            Stub.PostModelOutputs(
              {
                user_app_id: {
                  user_id: "clarifai",
                  app_id: "main"
                },
                model_id: "general-english-image-caption-clip",
                inputs: [ImageMethod]
              },
              Metadata,
              (Error, Response) => {
                console.log("Uploading url to clarify:\t" +
                  Response.status.description);
                if (Error) {
                  return console.error(Error);
                }
                if (Response.status.code !== 10000) {
                  return console.error("Post model outputs failed, status: " +
                    Response.status.description);
                }
                (async () => {
                  console.log(Response.outputs[0].data.text.raw);
                  GetTextImage(Name, Response.outputs[0].data.text.raw, Message);
                  ObtainMonikaResponse(ChatId);
                })();
              });
          }
        })
    }
  });
} // function for image classify

function AppendFS(UserName, Text) {
  FileSystem.appendFile(`./node_modules/${UserName}.txt`, `${Text}`,
    function(Error) {
      if (Error) throw Error;
    });
} // function for appending file

function WriteFS(DirrectionToTheFile, Text) {
  FileSystem.writeFile(`./${DirrectionToTheFile}`, `${Text}`, function(Error) {
    if (Error) throw Error;
    console.log('Updated!');
  });
} // function for writing file

function CreateGeminiRequest(EngineName, Prompt, TokenNum,
  Temperature, StopSigns) {
  try {
    return ai.models.generateContent({
      model: EngineName,
      contents: Prompt,
      config: {
        systemInstruction: "You are Monika from DDLC.",
      }
    });
  } catch (Error) {
    console.log(`There is some error:\n${Error}`);
  }
} // function for creating request from Gemini

function GetPersonName(FirstName, LastName, UserName) {
  if (FirstName === undefined) return UserName;
  else if (LastName === undefined) return FirstName;
  else return `${FirstName} ${LastName}`;
} // function for getting Name for prompt

async function AuthoriseImgur() {
  const Response = await Fetch(`https://api.imgur.com/oauth2\
/authorize?client_id=${process.env.IMGUR_CLIENT_ID}&response_type=token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })
  const Data = await Response.json();
  console.log("Authorised!");
} // function for Imgur auth

async function FetchTelegram(IsForDownload, FileID) {
  if (IsForDownload) {
    const Response = await Fetch(`https://api.telegram.org/bot${Token}\
/getFile?file_id=${FileID}`);
    const Json = await Response.json();
    const DownloadLink = `https://api.telegram.org/file/bot${Token}\
/${Json.result.file_path}`;
    console.log("There is Output prompt:\n" + PromptOut);
    return { Continue: true, Json: Json, DownloadLink: DownloadLink };
  } else {
    const Response = await Fetch(`https://api.telegram.org/bot${Token}\
/getFile?file_id=${FileID}`);
    const Json = await Response.json();
    console.log("Finding url:\t\t\t\t" + Json.ok);
    return {
      Continue: false, Link: `https://api.telegram.org/file/bot${Token}\
/${Json.result.file_path}`
    };
  }
} // function for Telegram fetch to get file link

function GetDownloadPath(Json, DownloadLink) {
  Https.get(DownloadLink, (NewResponse) => {
    const Path = (`${__dirname}/Files/${Json.result.file_path}`);
    const FilePath = FileSystem.createWriteStream(Path);
    NewResponse.pipe(FilePath);
    FilePath.on('finish', () => {
      FilePath.close();
      console.log('Done!');
      return Path;
    })
  });
} // function for getting link and download file from its link

function GoogleClassify(Json) {
  try {
    EdenSDK.image_face_detection_create({
      response_as_dict: 'true',
      attributes_as_list: 'false',
      show_original_response: 'true',
      providers: 'microsoft',
      file: `${__dirname}/Files/${Json.result.file_path}`
    },
      { accept: 'application/json' })
  } catch (Error) {
    console.log(`There is some error:\n${Error}`)
  }
} // function for getting request from cv-system (microsoft)

function ObtainAdditionPrompt() {
  if ((Object.keys(data.microsoft.items).length > 0) &&
    (Object.keys(data.microsoft.items).length != undefined)) {
    CurrentPromptOut += `There is ${Object.keys(data.microsoft.items).length} human on this picture.\n`
    for (i = 0; i < Object.keys(data.microsoft.items).length; i++) {
      CropImage(Json, data, Width, Height, i);
      CurrentPromptOut += `I can see ${NyckelPost(NyckelAccessToken, UploadImageImgur(i))} on this photo.\n`;
    }
    return CurrentPromptOut;
  } else {
    return `There is no any human on this picture.`;
  }
}

async function IBMTTS(Text) {
  const MessageCode = await EdenSDK.translation_language_detection_create({
    response_as_dict: true,
    attributes_as_list: false,
    show_original_response: false,
    providers: 'microsoft',
    text: Text
  })
  console.log(MessageCode);
  const AudioData64 = await EdenSDK.audio_text_to_speech_create({
    response_as_dict: true,
    attributes_as_list: false,
    show_original_response: false,
    providers: 'ibm',
    language: 'en',
    text: Text,
    option: 'FEMALE'
  })
  if (AudioData64.status == 200) {
    console.log(Buffer.from(AudioData64.data.ibm.audio, 'base64'));
    await Monika.sendAudio("745436680", { source: Buffer.from(AudioData64.data.ibm.audio, 'base64') });
  }
}

function CropImage(Json, Data, Width, Height, i) {
  Sharp(`${__dirname}/Files/${Json.result.file_path}`)
    .extract({
      width: parseInt(Width * (Data.microsoft.items[i].bounding_box.x_max -
        Data.microsoft.items[i].bounding_box.x_min)),
      height: parseInt(Height * (Data.microsoft.items[i].bounding_box.y_max -
        Data.microsoft.items[i].bounding_box.y_min)),
      left: parseInt(Width * Data.microsoft.items[i].bounding_box.x_min),
      top: parseInt(Height * Data.microsoft.items[i].bounding_box.y_min)
    })
    .toFile(`${__dirname}/Files/Masks/Face_${i + 1}.jpg`)
    .then(function(NewFileInfo) {
      console.log("Image cropped and saved");
    })
    .catch(function(Error) {
      console.log("An error occured in new file\nHere the detail:\n" + Error);
    });
} // function for croping image to face mask

async function UploadImageImgur(i) {
  try {
    return await ClientImgur.upload({
      image: FileSystem.createReadStream(`${__dirname}/Files/Masks/Face_${i + 1}.jpg`),
      type: 'stream',
    })
  } catch (Error) {
    return console.error(`There is some error:\n${Error}`)
  }
} // function for uploading face mask to imgur for next link obtaining

async function NyckelConnect() {
  try {
    const Response = await Fetch('https://www.nyckel.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `client_id=${process.env.NYCKEL_CLIENT_ID}&client_secret=${process.env.NYCKEL_CLIENT_SECRET}&grant_type=client_credentials`
    }).then(Data => {
      NyckelPost(Data.access_token).then(Data => {
      })
    })
  } catch (Error) {
    console.log(`There is some error:\n${Error}`)
  }
} // function for connecting nyckel api to this code

async function NyckelPost(AccessToken, Link) {
  try {
    const Response = await Fetch('https://www.nyckel.com/v1/functions/vqok5v8mbfj1o8xg/invoke', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + AccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ "data": `${Link}` }),
      includeMetadata: true
    })
    const Data = await Response.json();
    return await Data.labelName;
  } catch (Error) {
    console.log(`There is some error:\n${Error}`)
  }
} // function for getting request from Nyckel cv to obtain information about label on face

function GetTextImage(Name, PromptCV, Message) {
  if (Message != undefined) {
    PromptMain += `${Name} sends a photo with text (${Message})${FirstStopSign}CV-System:\nIts photo contains ${PromptCV}${FirstStopSign}Monika:\n`;
    // AppendFS(ChatName, `${Name} sends a photo with text (${Message})${FirstStopSign}CV-System:\nIts photo contains ${PromptCV}${FirstStopSign}Monika:\n`);
  } else {
    PromptMain += `${Name} sends a photo without text.${FirstStopSign}CV-System:\nIts photo contains ${PromptCV}${FirstStopSign}Monika:\n`;
    // AppendFS(ChatName, `${Name} sends a photo with text (${Message})${FirstStopSign}CV-System:\nIts photo contains ${PromptCV}${FirstStopSign}Monika:\n`);
  }
} // function for generating CV-System dialog for MainPrompt

async function ObtainMonikaResponse(ChatId) {
  const GPTResponse = await CreateGeminiRequest('models/gemini-2.5-pro-exp-03-25', PromptMain, 512, 0.88, [ThirdStopSign, FirstStopSign, SecondStopSign]);
  let splittedResponse = GPTResponse.text.split("\n+");
  if (GPTResponse.text.startsWith(`[system.sendLocation`) ||
    GPTResponse.text.startsWith(`\n[system.sendLocation`)) {
    Monika.sendLocation(ChatId,
      parseFloat(GPTResponse.text.substring(22)),
      parseFloat(GPTResponse.text.substring(33)));
    //Monika.sendMessage(ChatId, GPTResponse.text);
  } else {
    // AppendFS(ChatName, `Monika:\n${GPTResponse.text}\n_\t_\t_\n`);
    PromptMain += `${GPTResponse.text}${SecondStopSign}`;
    //Monika.sendMessage(ChatId, GPTResponse.text);
  }
  for (i = 0; i < splittedResponse.length; i++)
    try {
      Monika.sendMessage(ChatId, splittedResponse[i]);
    } catch (error) {
      console.log("There is some error:");
      console.log(error);
    }
  PromptEmotionCore += `${GPTResponse.text}${SecondStopSign}ESFM:\n`;
  GPTResponseEmotion = await CreateGeminiRequest('models/gemini-2.5-flash-preview-04-17', PromptEmotionCore, 20, 0.45, ['\n', SecondStopSign], ".");
  console.log(`Emotion for this message: ${GPTResponseEmotion.text}\n\n`);
  PromptEmotionCore += `${GPTResponseEmotion.text}\n\n`;
}

async function ImageClassificationFunctions(Name, Message, Decision, Link, ChatId) {
  const GetFileOrLink = await FetchTelegram(Decision, Link);
  if (GetFileOrLink.Continue) {
    const FilePath = await GetDownloadPath(GetFileOrLink.Json, GetFileOrLink.DownloadLink);
    await ImageToText(Name, Message, ChatId, GetFileOrLink.Continue, FilePath);
  } else {
    await ImageToText(Name, Message, ChatId, GetFileOrLink.Continue, GetFileOrLink.Link);
  }
}


Monika.on('message', async (message) => {


  IsNotPromise = true;
  console.log(`It's ${message.message_id} message in Monika messages tree.\nSended from \
${message.from.id} in ${message.chat.id}.`);
  if (message.text != "") {
    if (message.from.is_bot) SenderName = `Monika`;
    let SenderName = GetPersonName(message.from.first_name,
      message.from.last_name,
      message.from.username);
    if (!(message.chat.title === undefined)) {
      ChatName = `.chats/${message.chat.title}`;
      SenderName += ` (group "${message.chat.title}")`;
    }
    else {
      ChatName = `.users/${message.from.username}`;
      SenderName += ` (DM)`;
    }
    PromptVerifyCore += `${SenderName}:\n${message.text}${FourthStopSign}IIFM:\n`;
    (async () => {
      const GPTResponseVerify = await CreateGeminiRequest('models/gemini-1.5-flash', PromptVerifyCore,
        8, 0.64, [FourthStopSign]);
      PromptVerifyCore += `${GPTResponseVerify.text}\n`;
      TempMessage = `${message.text}`.toLowerCase();
      if (message.text === undefined) TempMessage = "undefined";
      let VerifyMessage = PromptVerifyCore.substring(PromptVerifyCore.length - 5);
      if ((TempMessage.startsWith('actmlm'))) {
        PromptMain += `${message.text.substring(6)}${FirstStopSign}`;
        (async () => {
          const GPTResponse = await CreateGeminiRequest('models/gemini-2.5-flash-preview-04-17', PromptMain, 512,
            0.88, [FirstStopSign, SecondStopSign,
            ThirdStopSign]);
          let ChatID = message.chat.id;
          Monika.sendMessage(ChatID, `${GPTResponse.text.substring(8)}`);
          console.log(`${GPTResponse.text}\n\n\n`);
          PromptMain += `${GPTResponse.text}${SecondStopSign}`;
          PromptEmotionCore += `${GPTResponse.text}${SecondStopSign}\n`;
          (async () => {
            const GPTResponseEmotion = await CreateGeminiRequest('models/gemini-1.5-flash',
              PromptEmotionCore, 20, 0.6,
              [FourthStopSign, SecondStopSign, "."]);
            console.log(`${GPTResponseEmotion.text}\n[END-OF-CHAT-ONE-BLOCK]\n\n`);
            PromptEmotionCore += `${GPTResponseEmotion.text}\n\n`;
          })();
        })();
        return 0;
      } else if (TempMessage.startsWith(`${process.env.COMMAND_ONE}`)) {
        let ChatId = message.chat.id;
        Monika.sendMessage(ChatId, "Okie~");
        PromptMain = `Rebot time for the system have this time:\n${Now}\n${process.env.prompt}`;
        PromptVerifyCore = `${process.env.PROMPT_VERIFY_CORE}`;
        PromptEmotionCore = `${process.env.PROMPT_EMOTION_CORE}`;
      } else if (TempMessage.startsWith(`${process.env.COMMAND_TWO}`)) {
        IBMTTS(TempMessage);
      } else if ((VerifyMessage.toLowerCase().startsWith(':fm:')) ||
        TempMessage.startsWith("monika") ||
        TempMessage.startsWith("моника") ||
        message.chat.type == 'private') {
        Now = new Date(new Date().getTime() + Offset * 3600 * 1000).toUTCString().replace(/ GMT$/, "");
        PromptMain += `${Now}\n_\n`;
        // AppendFS(ChatName, `${Now}\n`);
        if (message.sticker === undefined) {
          if (message.photo != undefined) {
            IsNotPromise = false;
            ImageClassificationFunctions(
              SenderName, message.caption, false,
              message.photo[Object.keys(message.photo).length - 1].file_id,
              message.chat.id
            );

          } else if ((message.document != undefined) &&
            (message.document.mime_type.startsWith("image"))) {
            IsNotPromise = false;
            console.log();
          } else if (message.location != undefined) {
            PromptMain += `${SenderName} gives you an access to his live location for \
${message.location.live_period}.\nIt's ${message.location.latitude} \
${message.location.longitude} right now.${FirstStopSign}Monika:\n`;
          } else if (message.video != undefined) {
            IsNotPromise = false;
            ImageClassificationFunctions(
              SenderName, message.caption, false, message.video.file_id,
              message.chat.id
            );
          } else {
            // AppendFS(ChatName, `${SenderName}:\n${message.text}\n-\t-\t-\n`);
            PromptMain += `${SenderName}:\n${message.text}${FirstStopSign}Monika:\n`;
          }
        } else {
          PromptMain += `${SenderName} send to Monika a sticker with emoji \
${message.sticker.emoji} from the pack ${message.sticker.set_name}. Animated: \
${message.sticker.is_animated}.${FirstStopSign}\n`;
          ImageClassificationFunctions(
            SenderName, message.caption, false,
            message.sticker.file_id, message.chat.id
          );
        }
        if (IsNotPromise) {
          ObtainMonikaResponse(message.chat.id);
        }
      } else if (TempMessage.startsWith("Import messages from")) {
        //let ChatId = 745436680;
        let ChatId = 247426793;
        let BotId = 5321782990;
        let ForwardToId = -688128100;
        console.log(`Start Import (StartPoint = ${StartPoint}, EndPoint = ${EndPoint})`);
        try {
          while (StartPoint <= EndPoint) {
            for (i = StartPoint; i <= EndPoint; i++) {
              Monika.forwardMessage(ForwardToId, ChatId, i);
              Monika.forwardMessage(ForwardToId, BotId, i);
            }
            StartPoint += 30;
          }
        }
        catch (error) {
          console.error(error);
        }
        EndPoint += EndPoint;
        console.log("End Import");
        //Monika.forwardMessage(ForwardToId, ChatId, 22400);
      } else if (TempMessage == `send()`) {
        let ChatId = 5064484668; //-1001611644839; //-1001708913072;
        (async () => {
          //await Monika.sendMessage(-1001611644839, 
          //`${process.env.MESSAGE_SEND_GROUP_1}`);
          //await Monika.sendMessage(-1001611644839, 
          //`${process.env.MESSAGE_SEND_GROUP_2}`);
          await Monika.sendDocument(5064484668, 'Files/HBA.gif', { caption: process.env.MESSAGE_ALEX, });
          //await Monika.sendPhoto(ChatId, 'Files/HBA.jpg', { caption: process.env.MESSAGE_ALEX, })
          console.log("Sended successfully!");
          //await Monika.sendMessage(ChatId, process.env.MESSAGE_OLGA);
          //  await Monika.sendMessage(-1001611644839, "successful!");
        })();
      }
    })();
  };
});

KeepAlive();