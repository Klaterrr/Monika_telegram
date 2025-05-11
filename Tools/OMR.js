async function ObtainResponse(ChatId) {
  const GPTResponse = await CreateOpenAIRequest('text-davinci-003', PromptMain, 512, 0.88, [ThirdStopSign, FirstStopSign, SecondStopSign]);
  if (GPTResponse.data.choices[0].text.startsWith(`[system.sendLocation`) ||
    GPTResponse.data.choices[0].text.startsWith(`\n[system.sendLocation`)) {
    Monika.sendLocation(ChatId,
      parseFloat(GPTResponse.data.choices[0].text.substring(22)),
      parseFloat(GPTResponse.data.choices[0].text.substring(33)));
    Monika.sendMessage(ChatId, GPTResponse.data.choices[0].text.substring(47));
  } else {
    Monika.sendMessage(ChatId, `${GPTResponse.data.choices[0].text}`);
    AppendFS(ChatName, `Monika:\n${GPTResponse.data.choices[0].text}\n_\t_\t_\n`);
    PromptMain += `${GPTResponse.data.choices[0].text}${SecondStopSign}`;
    PromptEmotionCore += `${GPTResponse.data.choices[0].text}${SecondStopSign}ESFM:\n`;
    GPTResponseEmotion = await CreateOpenAIRequest('text-curie-001', PromptEmotionCore, 20, 0.45, ['\n', SecondStopSign], ".");
    console.log(`Emotion for this message: ${GPTResponseEmotion.data.choices[0].text}\n\n`);
    PromptEmotionCore += `${GPTResponseEmotion.data.choices[0].text}\n\n`;
  }
}



module.exports = {
  obtainResponse: ObtainResponse(ChatId),
}