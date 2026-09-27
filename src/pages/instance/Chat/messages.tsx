import { ExternalLink, Facebook, Instagram, Megaphone, Send, User } from "lucide-react";
import { RefObject, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@evoapi/design-system/avatar";
import { Button } from "@evoapi/design-system/button";
import { Textarea } from "@/components/ui/textarea";

import { useInstance } from "@/contexts/InstanceContext";

import { useFindChat } from "@/lib/queries/chat/findChat";
import { useFindMessages } from "@/lib/queries/chat/findMessages";
import { useSendMessage, useSendMedia } from "@/lib/queries/chat/sendMessage";
import { getToken, TOKEN_ID } from "@/lib/queries/token";

import { Message } from "@/types/evolution.types";

import { connectSocket, disconnectSocket } from "@/services/websocket/socket";
import { subtituloDelChat } from "./index";

// Import components from EmbedChatMessage for attachment functionality
import { MediaOptions } from "../EmbedChatMessage/InputMessage/media-options";
import { SelectedMedia } from "../EmbedChatMessage/InputMessage/selected-media";
import { fotoSiVigente } from "@/lib/foto-perfil";

type MessagesProps = {
  textareaRef: RefObject<HTMLTextAreaElement>;
  handleTextareaChange: () => void;
  textareaHeight: string;
  lastMessageRef: RefObject<HTMLDivElement>;
  scrollToBottom: () => void;
};

// Utility function to format dates like WhatsApp
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const formatDateSeparator = (date: Date, t: TFn, locale: string): string => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const messageDate = new Date(date);

  if (messageDate.toDateString() === today.toDateString()) {
    return t("chat.date.today", { defaultValue: "Hoje" });
  }

  if (messageDate.toDateString() === yesterday.toDateString()) {
    return t("chat.date.yesterday", { defaultValue: "Ontem" });
  }

  const daysDiff = Math.floor((today.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff < 7) {
    return messageDate.toLocaleDateString(locale, { weekday: "long" });
  }

  return messageDate.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

// Utility function to get timestamp from message
const getMessageTimestamp = (message: Message): Date => {
  try {
    if (!message.messageTimestamp) {
      return new Date();
    }

    // Handle case where timestamp is an object
    if (typeof message.messageTimestamp === "object") {
      const possibleTimestamps = [
        (message.messageTimestamp as any).low,
        (message.messageTimestamp as any).seconds,
        (message.messageTimestamp as any).timestamp,
        (message.messageTimestamp as any).time,
        (message.messageTimestamp as any).value,
      ];

      const timestamp = possibleTimestamps.find((val) => typeof val === "number" && !isNaN(val)) || Date.now() / 1000;

      return new Date(timestamp * 1000);
    }
    // Handle number or numeric string
    else if (!isNaN(Number(message.messageTimestamp))) {
      const timestamp = Number(message.messageTimestamp);

      // Check if it's milliseconds format (13 digits) or seconds format (10 digits)
      if (timestamp > 1000000000000) {
        return new Date(timestamp);
      } else {
        return new Date(timestamp * 1000);
      }
    }
    // If it's an ISO date string format
    else if (typeof message.messageTimestamp === "string" && message.messageTimestamp.includes("T")) {
      return new Date(message.messageTimestamp);
    }

    return new Date();
  } catch (error) {
    return new Date();
  }
};

// Component for date separator
const DateSeparator = ({ date }: { date: string }) => (
  <div className="flex items-center justify-center py-3">
    <div className="rounded-full bg-muted/50 px-3 py-1">
      <span className="text-xs font-medium text-muted-foreground">{date}</span>
    </div>
  </div>
);

const formatMessageTime = (date: Date, locale: string): string =>
  date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

// WhatsApp-like deterministic color palette per sender
const SENDER_COLORS = [
  "#e91e63", "#9c27b0", "#3f51b5", "#2196f3", "#00bcd4",
  "#009688", "#4caf50", "#ff9800", "#f44336", "#795548",
];

const getSenderColor = (key: string): string => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
};

// Helper function to extract text content from message
const getMessageText = (messageObj: any): string => {
  if (!messageObj) return "";

  // Try to parse if it's a string
  if (typeof messageObj === "string") {
    try {
      const parsed = JSON.parse(messageObj);
      return parsed.conversation || parsed.text || messageObj;
    } catch {
      return messageObj;
    }
  }

  // If it's already an object, extract conversation or text
  if (typeof messageObj === "object") {
    return messageObj.conversation || messageObj.text || "";
  }

  return String(messageObj);
};

// PD (27 sep 2026): DE QUÉ ANUNCIO VIENE QUIEN ESCRIBE. WhatsApp enseña en el teléfono la foto del
// anuncio con su enlace; aquí no se veía. El backend lo guarda en `contextInfo.externalAdReply`, con la
// misma forma en Baileys y en la Cloud API (en esta, traducido del `referral` de Meta). Luis: «Eso es
// importante saberlo para saber sobre qué responderle».
const anuncioDelMensaje = (message: Message) =>
  message.contextInfo?.externalAdReply ||
  message.message?.extendedTextMessage?.contextInfo?.externalAdReply ||
  message.message?.contextInfo?.externalAdReply;

const TarjetaDeAnuncio = ({ message }: { message: Message }) => {
  const anuncio = anuncioDelMensaje(message);
  const [sinImagen, setSinImagen] = useState(false);
  if (!anuncio || !(anuncio.sourceUrl || anuncio.title || anuncio.body)) return null;

  // La miniatura de Meta caduca (parámetro `oe`): si ya venció, ni se pide.
  const imagen = sinImagen ? undefined : fotoSiVigente(anuncio.thumbnailUrl);
  const plataforma = plataformaDelAnuncio(message, anuncio);

  return (
    <div className="mb-2 overflow-hidden rounded-md border bg-background text-foreground">
      {/* Entera, sin recortar (Luis: «no se ve la imagen completa, se ve como un banner»). La Cloud API
          manda una miniatura ya cuadrada (306×306): el 4:5 original no viaja en el mensaje. */}
      {imagen && (
        <div className="relative">
          <img
            src={imagen}
            alt=""
            className="block h-auto max-h-80 w-full bg-muted object-contain"
            onError={() => setSinImagen(true)}
          />
          {/* Como en WhatsApp: el logo de la red, abajo a la derecha de la imagen. */}
          {plataforma && (
            <span className="absolute bottom-2 right-2 rounded-full bg-white p-1 shadow">
              <LogoDeRed plataforma={plataforma} />
            </span>
          )}
        </div>
      )}
      <div className="space-y-1 px-2 py-1.5">
        <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Megaphone className="h-3 w-3" /> Desde un anuncio
        </div>
        {anuncio.title && <p className="text-sm font-semibold leading-snug">{anuncio.title}</p>}
        {anuncio.body && <p className="line-clamp-3 text-xs text-muted-foreground">{anuncio.body}</p>}
        {anuncio.greetingMessageBody && (
          <p className="text-xs italic text-muted-foreground">Bienvenida: {anuncio.greetingMessageBody}</p>
        )}
        {(anuncio.sourceUrl || plataforma) && (
          <div className="flex items-center justify-between gap-2">
            {anuncio.sourceUrl ? (
              <a
                href={anuncio.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Ver el anuncio
              </a>
            ) : (
              <span />
            )}
            {/* Sin imagen, el logo va aquí, a la derecha del enlace. */}
            {!imagen && plataforma && <LogoDeRed plataforma={plataforma} />}
          </div>
        )}
      </div>
    </div>
  );
};

const LogoDeRed = ({ plataforma }: { plataforma: "instagram" | "facebook" }) =>
  plataforma === "instagram" ? (
    <span title="Instagram" aria-label="Instagram">
      <Instagram className="h-4 w-4" style={{ color: "#E1306C" }} />
    </span>
  ) : (
    <span title="Facebook" aria-label="Facebook">
      <Facebook className="h-4 w-4" style={{ color: "#1877F2" }} />
    </span>
  );

// De qué red viene, con el MISMO criterio que la tarjeta de WhatsApp: por QR, lo que dice
// `contextInfo.entryPointConversionApp`; si no, el enlace del anuncio (`fb.me`/facebook.com →
// Facebook, instagram.com → Instagram). Ni WhatsApp lo sabe seguro —encima del chat pone «a partir de
// un anuncio en Facebook o Instagram»—, pero su tarjeta enseña el logo del enlace, y Luis lo quiere
// igual: «sobre la imagen, en el borde derecho inferior, sale un logo de Facebook».
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function plataformaDelAnuncio(message: Message, anuncio: any): "instagram" | "facebook" | undefined {
  const url = String(anuncio?.sourceUrl || "");
  const pistas = [
    message.contextInfo?.entryPointConversionApp,
    message.message?.extendedTextMessage?.contextInfo?.entryPointConversionApp,
    anuncio?.sourceApp,
    /instagram\.com|instagr\.am/i.test(url) ? "instagram" : undefined,
    /(^|\/\/|\.)(fb\.me|facebook\.com|fb\.com)\b/i.test(url) ? "facebook" : undefined,
  ]
    .filter(Boolean)
    .map((p) => String(p).toLowerCase());
  if (pistas.some((p) => p.includes("instagram"))) return "instagram";
  if (pistas.some((p) => p.includes("facebook") || p === "fb")) return "facebook";
  return undefined;
}

// Component to render different message types based on messageType
const MessageContent = ({ message }: { message: Message }) => {
  const messageType = message.messageType as string;

  switch (messageType) {
    case "conversation":
      if (message.message.contactMessage) {
        const contactMsg = message.message.contactMessage;
        return (
          <div className="p-3 bg-muted rounded-lg max-w-xs">
            <div className="flex items-center gap-2 mb-2">
              <div className="text-xl">👤</div>
              <span className="font-medium">Contact</span>
            </div>
            {contactMsg.displayName && <p className="text-sm font-medium">{contactMsg.displayName}</p>}
            {contactMsg.vcard && <p className="text-xs text-muted-foreground">Contact card</p>}
          </div>
        );
      }

      if (message.message.locationMessage) {
        const locationMsg = message.message.locationMessage;
        return (
          <div className="p-3 bg-muted rounded-lg max-w-xs">
            <div className="flex items-center gap-2 mb-2">
              <div className="text-xl">📍</div>
              <span className="font-medium">Location</span>
            </div>
            {locationMsg.name && <p className="text-sm font-medium">{locationMsg.name}</p>}
            {locationMsg.address && <p className="text-xs text-muted-foreground">{locationMsg.address}</p>}
            {locationMsg.degreesLatitude && locationMsg.degreesLongitude && (
              <a
                href={`https://maps.google.com/?q=${locationMsg.degreesLatitude},${locationMsg.degreesLongitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm mt-1 inline-block">
                View on Maps
              </a>
            )}
          </div>
        );
      }

      return <span>{getMessageText(message.message)}</span>;

    case "extendedTextMessage":
      return <span>{message.message.conversation ?? message.message.extendedTextMessage?.text}</span>;

    case "imageMessage":
      // Use base64 data or mediaUrl for images
      const imageBase64 = message.message.base64 ? (message.message.base64.startsWith("data:") ? message.message.base64 : `data:image/jpeg;base64,${message.message.base64}`) : null;

      const imageSrc = imageBase64 || message.message.mediaUrl;

      return (
        <div className="flex flex-col gap-2">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt="Image"
              className="rounded-lg max-w-full h-auto"
              style={{
                maxWidth: "400px",
                maxHeight: "400px",
                objectFit: "contain",
              }}
              loading="lazy"
            />
          ) : (
            <div className="rounded bg-muted p-4 max-w-xs">
              <p className="text-center text-muted-foreground">Image couldn't be loaded</p>
              <p className="text-center text-xs text-muted-foreground mt-1">Missing base64 data and mediaUrl</p>
            </div>
          )}
          {message.message.imageMessage?.caption && <p className="text-sm">{message.message.imageMessage.caption}</p>}
        </div>
      );

    case "videoMessage":
      // Use base64 data or mediaUrl for videos
      const videoBase64 = message.message.base64 ? (message.message.base64.startsWith("data:") ? message.message.base64 : `data:video/mp4;base64,${message.message.base64}`) : null;

      const videoSrc = videoBase64 || message.message.mediaUrl;

      return (
        <div className="flex flex-col gap-2">
          {videoSrc ? (
            <video
              src={videoSrc}
              controls
              className="rounded-lg max-w-full h-auto"
              style={{
                maxWidth: "400px",
                maxHeight: "400px",
              }}
            />
          ) : (
            <div className="rounded bg-muted p-4 max-w-xs">
              <p className="text-center text-muted-foreground">Video couldn't be loaded</p>
              <p className="text-center text-xs text-muted-foreground mt-1">Missing base64 data and mediaUrl</p>
            </div>
          )}
          {message.message.videoMessage?.caption && <p className="text-sm">{message.message.videoMessage.caption}</p>}
        </div>
      );

    case "audioMessage":
      // Use base64 data or mediaUrl for audio
      const audioBase64 = message.message.base64 ? (message.message.base64.startsWith("data:") ? message.message.base64 : `data:audio/mpeg;base64,${message.message.base64}`) : null;

      const audioSrc = audioBase64 || message.message.mediaUrl;

      return audioSrc ? (
        <audio controls className="w-full max-w-xs">
          <source src={audioSrc} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
      ) : (
        <div className="rounded bg-muted p-4 max-w-xs">
          <p className="text-center text-muted-foreground">Audio couldn't be loaded</p>
          <p className="text-center text-xs text-muted-foreground mt-1">Missing base64 data and mediaUrl</p>
        </div>
      );

    case "documentMessage":
      return (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg max-w-xs">
          <div className="text-2xl">📄</div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{message.message.documentMessage?.fileName || "Document"}</p>
            {message.message.documentMessage?.fileLength && <p className="text-xs text-muted-foreground">{(message.message.documentMessage.fileLength / 1024 / 1024).toFixed(2)} MB</p>}
          </div>
        </div>
      );

    case "stickerMessage":
      return <img src={message.message.mediaUrl} alt="Sticker" className="max-w-32 max-h-32 object-contain" />;

    // PD: los botones de `sendButtons` y las plantillas de la Cloud API llegan sin texto plano,
    // y el chat los pintaba como «Unknown message type: interactiveMessage».
    case "interactiveMessage":
    case "templateMessage": {
      const nodo = message.message.interactiveMessage ?? message.message.templateMessage?.interactiveMessageTemplate;

      // Sin `return` aquí el componente devolvería undefined y React reventaría: no vale `break`.
      if (!nodo) return <span className="text-xs text-muted-foreground">Mensaje interactivo sin contenido</span>;

      const botones = nodo.nativeFlowMessage?.buttons ?? [];

      // PD: dentro de la burbuja se HEREDA el color (`text-current`, `border-current`). Con
      // `bg-muted`/`text-muted-foreground` los botones salían negros sobre el verde del saliente.
      return (
        <div className="flex flex-col gap-1.5">
          {(nodo.header?.title || nodo.header?.text) && <p className="font-semibold">{nodo.header?.title ?? nodo.header?.text}</p>}
          {nodo.body?.text && <p className="whitespace-pre-wrap">{conNegritas(nodo.body.text)}</p>}
          {nodo.footer?.text && <p className="text-xs opacity-70">{nodo.footer.text}</p>}
          {botones.length > 0 && (
            // Los márgenes negativos compensan el padding de la burbuja, para que las líneas
            // separadoras lleguen de borde a borde, como en WhatsApp.
            <div className="-mx-3 -mb-2 mt-1">
              {botones.map((boton: any, i: number) => (
                <div key={i} className="flex items-center justify-center gap-1.5 border-t border-current/20 px-3 py-2 font-medium">
                  <span aria-hidden className="opacity-70">
                    ↩
                  </span>
                  {etiquetaDeBoton(boton)}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // PD: y la respuesta del usuario al tocar uno de esos botones.
    case "templateButtonReplyMessage":
    case "buttonsResponseMessage":
    case "interactiveResponseMessage": {
      const respuesta =
        message.message.templateButtonReplyMessage?.selectedDisplayText ??
        message.message.buttonsResponseMessage?.selectedDisplayText ??
        message.message.buttonsResponseMessage?.selectedButtonId ??
        respuestaDeFlujoNativo(message.message.interactiveResponseMessage);

      if (!respuesta) return <span className="text-xs text-muted-foreground">Respuesta sin texto</span>;

      return (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="opacity-70">
            ↩
          </span>
          {respuesta}
        </span>
      );
    }

    default:
      // Fallback for unknown message types
      return (
        <div className="text-xs text-muted-foreground bg-muted p-2 rounded max-w-xs">
          <details>
            <summary>Unknown message type: {messageType}</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all text-xs">{JSON.stringify(message.message, null, 2)}</pre>
          </details>
        </div>
      );
  }
};

function Messages({ textareaRef, handleTextareaChange, textareaHeight, lastMessageRef, scrollToBottom }: MessagesProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { instance } = useInstance();
  const [messageText, setMessageText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null);
  const [realtimeMessages, setRealtimeMessages] = useState<Message[]>([]);
  const { sendText: sendTextMutation } = useSendMessage();
  const { sendMedia: sendMediaMutation } = useSendMedia();

  const { remoteJid } = useParams<{ remoteJid: string }>();

  // Handle sending text messages
  const sendTextMessage = async () => {
    if (!messageText.trim() || !remoteJid || !instance?.name || !instance?.token || isSending) return;

    try {
      setIsSending(true);
      await sendTextMutation({
        instanceName: instance.name,
        token: instance.token,
        data: {
          number: remoteJid,
          text: messageText.trim(),
        },
      });

      // Clear the input after sending
      setMessageText("");
      if (textareaRef.current) {
        textareaRef.current.value = "";
        handleTextareaChange(); // Reset height
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsSending(false);
    }
  };

  // Handle sending media messages
  const sendMediaMessage = async () => {
    if (!selectedMedia || !remoteJid || !instance?.name || !instance?.token || isSending) return;

    try {
      setIsSending(true);

      // Convert media to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(selectedMedia);
        reader.onload = () => {
          const base64 = reader.result as string;
          // Strip the data URI prefix (data:image/xyz;base64,)
          const base64Data = base64.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
      });

      await sendMediaMutation({
        instanceName: instance.name,
        token: instance.token,
        data: {
          number: remoteJid,
          mediaMessage: {
            mediatype: selectedMedia.type.split("/")[0] === "application" ? "document" : (selectedMedia.type.split("/")[0] as "audio" | "video" | "image" | "document"),
            mimetype: selectedMedia.type,
            caption: messageText.trim(),
            media: base64Data,
            fileName: selectedMedia.name,
          },
        },
      });

      // Clear the input and media after sending
      setSelectedMedia(null);
      setMessageText("");
      if (textareaRef.current) {
        textareaRef.current.value = "";
        handleTextareaChange(); // Reset height
      }
    } catch (error) {
      console.error("Error sending media:", error);
    } finally {
      setIsSending(false);
    }
  };

  // Handle message sending (decides between text or media)
  const sendMessage = async () => {
    if (selectedMedia) {
      await sendMediaMessage();
    } else {
      await sendTextMessage();
    }
  };

  // Handle Enter key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    handleTextareaChange();
  };
  const { data: chat } = useFindChat({
    remoteJid,
    instanceName: instance?.name,
  });

  const { data: messages, isSuccess } = useFindMessages({
    remoteJid,
    instanceName: instance?.name,
  });

  // Combine React Query messages with real-time updates
  const allMessages = useMemo(() => {
    if (!messages) return realtimeMessages;

    // Merge messages from React Query with real-time updates
    const messageMap = new Map();

    // First add all messages from React Query
    messages.forEach((message) => messageMap.set(message.key.id, message));

    // Then add/update with real-time messages
    realtimeMessages.forEach((message) => {
      messageMap.set(message.key.id, message);
    });

    return Array.from(messageMap.values());
  }, [messages, realtimeMessages]);

  // Add websocket functionality for real-time message updates
  useEffect(() => {
    if (!instance?.name || !remoteJid) return;

    const serverUrl = getToken(TOKEN_ID.API_URL);
    if (!serverUrl) {
      console.error("API URL not found in localStorage");
      return;
    }

    const socket = connectSocket(serverUrl);

    // Function to update messages from websocket events
    const updateMessagesFromWebsocket = (_eventType: string, data: any) => {
      if (!instance) return;

      if (data.instance !== instance.name) {
        return;
      }

      if (data?.data?.key?.remoteJid !== remoteJid) {
        return;
      }

      const message = data.data;

      setRealtimeMessages((prevMessages) => {
        // Check if message already exists
        const existingIndex = prevMessages.findIndex((msg) => msg.key.id === message.key.id);

        if (existingIndex !== -1) {
          // Update existing message
          const updatedMessages = [...prevMessages];
          updatedMessages[existingIndex] = message;
          return updatedMessages;
        } else {
          // Add new message
          return [...prevMessages, message];
        }
      });
    };

    // Function to update message status (simplified - just log for now)
    const updateMessageStatus = (data: any) => {
      if (!instance) return;
      if (data.instance !== instance.name) return;

      console.log("Received message status update:", data);
      // TODO: Implement proper message status updates when Message type supports it
    };

    // Set up event listeners
    socket.on("messages.upsert", (data: any) => {
      updateMessagesFromWebsocket("messages.upsert", data);
    });

    socket.on("send.message", (data: any) => {
      updateMessagesFromWebsocket("send.message", data);
    });

    socket.on("messages.update", (data: any) => {
      updateMessageStatus(data);
    });

    socket.connect();

    // Cleanup function
    return () => {
      socket.off("messages.upsert");
      socket.off("send.message");
      socket.off("messages.update");
      disconnectSocket(socket);
    };
  }, [instance?.name, remoteJid]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    if (!allMessages) return [];

    // Sort messages by timestamp first
    const sortedMessages = [...allMessages].sort((a, b) => {
      const aTime = getMessageTimestamp(a).getTime();
      const bTime = getMessageTimestamp(b).getTime();
      return aTime - bTime;
    });

    const grouped: { date: string; messages: Message[] }[] = [];
    let currentDate = "";
    let currentGroup: Message[] = [];

    sortedMessages.forEach((message) => {
      const messageDate = getMessageTimestamp(message);
      const dateString = messageDate.toDateString();

      if (dateString !== currentDate) {
        if (currentGroup.length > 0) {
          grouped.push({
            date: formatDateSeparator(new Date(currentDate), t, locale),
            messages: currentGroup,
          });
        }
        currentDate = dateString;
        currentGroup = [message];
      } else {
        currentGroup.push(message);
      }
    });

    if (currentGroup.length > 0) {
      grouped.push({
        date: formatDateSeparator(new Date(currentDate), t, locale),
        messages: currentGroup,
      });
    }

    return grouped;
  }, [allMessages, t, locale]);

  useEffect(() => {
    if (isSuccess && allMessages) {
      scrollToBottom();
    }
  }, [isSuccess, allMessages, scrollToBottom]);

  // Clear selected media and real-time messages when switching chats
  useEffect(() => {
    setSelectedMedia(null);
    setMessageText("");
    setRealtimeMessages([]); // Clear real-time messages when switching chats
    if (textareaRef.current) {
      textareaRef.current.value = "";
      handleTextareaChange();
    }
  }, [remoteJid]);

  const renderBubbleRight = (message: Message) => (
    <div key={message.id} className="mb-4 flex justify-end">
      <div className="max-w-[70%]">
        <div className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
          <MessageContent message={message} />
        </div>
        <span className="mt-0.5 block px-1 text-right text-[11px] text-muted-foreground">
          {formatMessageTime(getMessageTimestamp(message), locale)}
        </span>
      </div>
    </div>
  );

  const renderBubbleLeft = (message: Message) => {
    const isGroup = !!remoteJid?.endsWith("@g.us");
    const participant = message.key.participant;
    const senderKey = participant || message.pushName || "";
    const senderName = message.pushName || (participant ? participant.split("@")[0] : "");

    return (
      <div key={message.id} className="mb-4 flex justify-start">
        <div className="max-w-[70%]">
          {isGroup && senderName && (
            <div className="mb-1 text-xs font-semibold" style={{ color: getSenderColor(senderKey) }}>
              {senderName}
            </div>
          )}
          <div className="rounded-lg border bg-muted px-3 py-2 text-sm text-foreground">
            <TarjetaDeAnuncio message={message} />
            <MessageContent message={message} />
          </div>
          <span className="mt-0.5 block px-1 text-[11px] text-muted-foreground">
            {formatMessageTime(getMessageTimestamp(message), locale)}
          </span>
        </div>
      </div>
    );
  };

  // PARCHE PD (9 sep 2026): en la cabecera, lo mismo que en la lista de chats — arriba el
  // nombre de la cuenta y debajo, donde iría el teléfono que quien oculta su número no
  // tiene, su NOMBRE DE USUARIO de WhatsApp. El identificador solo si no hay usuario.
  const headerName = chat?.pushName || chat?.usuarioWa || chat?.remoteJid?.split("@")[0];
  // Mismo criterio que la lista, y de la misma función: sin usuario el teléfono; con
  // usuario y teléfono, los dos; y solo el usuario cuando esa persona oculta su número.
  const headerSub = chat?.remoteJid ? subtituloDelChat(chat, headerName) : "";

  return (
    <div className="flex h-full flex-col bg-muted/10">
      <div className="flex-shrink-0 border-b bg-background/95 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={fotoSiVigente(chat?.profilePicUrl)} alt={headerName} />
            <AvatarFallback className="bg-muted text-muted-foreground">
              <User className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">{headerName}</h3>
            <p className="truncate text-xs text-muted-foreground">{headerSub}</p>
          </div>
        </div>
      </div>
      <div className="flex w-full flex-1 flex-col overflow-y-auto px-4 py-4">
        {groupedMessages.map((group, groupIndex) => (
          <div key={groupIndex}>
            <DateSeparator date={group.date} />
            {group.messages.map((message) =>
              message.key.fromMe ? renderBubbleRight(message) : renderBubbleLeft(message),
            )}
          </div>
        ))}
        <div ref={lastMessageRef as never} />
      </div>
      <div className="flex-shrink-0 border-t bg-background p-3">
        <div className="rounded-lg border border-border bg-card shadow-sm">
          {selectedMedia && (
            <div className="border-b border-border bg-muted/30 px-3 py-2">
              <SelectedMedia selectedMedia={selectedMedia} setSelectedMedia={setSelectedMedia} />
            </div>
          )}
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex flex-shrink-0 items-center">
              {instance && <MediaOptions instance={instance} setSelectedMedia={setSelectedMedia} />}
            </div>
            <Textarea
              placeholder={t("chat.input.placeholder", { defaultValue: "Digite uma mensagem..." })}
              name="message"
              id="message"
              rows={1}
              ref={textareaRef}
              value={messageText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              style={{ height: textareaHeight }}
              className="min-h-9 flex-1 resize-none border-none bg-transparent px-2 py-1.5 text-sm shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <Button
              type="button"
              size="icon"
              onClick={sendMessage}
              disabled={(!messageText.trim() && !selectedMedia) || isSending}
              className="h-9 w-9 flex-shrink-0 bg-primary text-primary-foreground hover:bg-primary/85 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">{t("chat.input.send")}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { Messages };

/** PD: la etiqueta visible de un botón de flujo nativo vive dentro de `buttonParamsJson`. */
function etiquetaDeBoton(boton: any): string {
  try {
    const params = JSON.parse(boton?.buttonParamsJson ?? "{}");
    return params.display_text ?? params.title ?? boton?.name ?? "Botón";
  } catch {
    return boton?.name ?? "Botón";
  }
}

/** PD: lo que eligió el usuario cuando la respuesta llega como flujo nativo. */
function respuestaDeFlujoNativo(interactiveResponseMessage: any): string | undefined {
  const respuesta = interactiveResponseMessage?.nativeFlowResponseMessage;

  if (respuesta?.paramsJson) {
    try {
      const params = JSON.parse(respuesta.paramsJson);
      return params.display_text ?? params.title ?? params.id;
    } catch {
      // si no es JSON válido se cae al nombre del flujo
    }
  }

  return respuesta?.name ?? interactiveResponseMessage?.body?.text;
}

/** PD: WhatsApp escribe la negrita con *asteriscos*; aquí se pinta de verdad. */
function conNegritas(texto: string) {
  return texto.split(/(\*[^*\n]+\*)/g).map((trozo, i) =>
    trozo.startsWith("*") && trozo.endsWith("*") && trozo.length > 2 ? (
      <strong key={i}>{trozo.slice(1, -1)}</strong>
    ) : (
      <span key={i}>{trozo}</span>
    ),
  );
}
