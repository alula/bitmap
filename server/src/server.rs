use crate::{
    bitmap::Bitmap,
    common::{PResult, STATE_PATH},
    config::Settings,
    protocol::{Message, MessageMut, MessageType, PROTOCOL_VERSION_MAJOR, PROTOCOL_VERSION_MINOR},
};
use soketto::{
    handshake::{server::Response, Server},
    Data,
};
use std::{
    io,
    net::{IpAddr, SocketAddr},
    str::FromStr,
    sync::{atomic::AtomicU32, Arc},
};
use tokio::{
    net::TcpStream,
    sync::{Mutex, RwLock},
    task::{JoinHandle, JoinSet},
};
use tokio_stream::{wrappers::TcpListenerStream, StreamExt};
use tokio_util::compat::TokioAsyncReadCompatExt;

pub struct BitmapServer {
    ctx: Arc<SharedServerContext>,
}

struct SharedServerContext {
    settings: Settings,
    bitmap: RwLock<Bitmap>,
    client_count: AtomicU32,
}

impl BitmapServer {
    pub fn new(settings: Settings) -> Box<Self> {
        let mut bitmap = Bitmap::new();
        match bitmap.load_from_file(STATE_PATH) {
            Ok(_) => log::info!("Loaded bitmap state from file"),
            Err(e) => log::warn!("Failed to load bitmap state from file: {}", e),
        }

        let ctx = Arc::new(SharedServerContext {
            settings,
            bitmap: RwLock::new(bitmap),
            client_count: AtomicU32::new(0),
        });

        Box::new(Self { ctx })
    }

    pub async fn run(&self) -> PResult<()> {
        let net_task = Self::net_task(self.ctx.clone());
        let bitmap_task = Self::bitmap_task(self.ctx.clone());

        let mut join_set = JoinSet::new();
        join_set.spawn(async move { net_task.await });
        join_set.spawn(async move { bitmap_task.await });

        while let Some(result) = join_set.join_next().await {
            result??;
        }

        Ok(())
    }

    async fn bitmap_task(ctx: Arc<SharedServerContext>) -> PResult<()> {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            {
                ctx.bitmap.write().await.periodic_send_changes();
            }
        }
    }

    async fn net_task(ctx: Arc<SharedServerContext>) -> PResult<()> {
        let listener = tokio::net::TcpListener::bind(&ctx.settings.bind_address).await?;
        log::info!("Server running on {}", listener.local_addr()?);

        let mut incoming = TcpListenerStream::new(listener);

        while let Some(socket) = incoming.next().await {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                ctx.client_count
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                let result = Self::client_task(socket, &ctx).await;
                if let Err(e) = result {
                    log::error!("Client task error: {}", e);
                }
                ctx.client_count
                    .fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
            });
        }

        Ok(())
    }

    async fn client_task(
        socket: io::Result<TcpStream>,
        ctx: &Arc<SharedServerContext>,
    ) -> PResult<()> {
        let socket = socket?;
        let peer_addr = socket.peer_addr().ok();
        let mut server = Server::new(socket.compat());

        let websocket_key = {
            let req = server.receive_request().await?;
            req.key()
        };

        let ip = {
            let mut header_buf = [httparse::EMPTY_HEADER; 32];
            let mut request = httparse::Request::new(&mut header_buf);

            let buffer = server.take_buffer();

            match request.parse(buffer.as_ref()) {
                Ok(httparse::Status::Complete(_)) => (),
                _ => return Err(Box::new(BitmapError::InvalidHttp)),
            };

            let ip = Self::get_ip(
                peer_addr.as_ref(),
                if ctx.settings.parse_proxy_headers {
                    Some(request.headers)
                } else {
                    None
                },
            );

            server.set_buffer(buffer);
            ip
        };

        if let Some(ip) = ip {
            log::info!("New connection from {}", ip);
        }

        // Here we accept the client unconditionally.
        let accept = Response::Accept {
            key: websocket_key,
            protocol: None,
        };
        server.send_response(&accept).await?;

        // And we can finally transition to a websocket connection.
        let (mut sender, mut receiver) = server.into_builder().finish();

        let mut send_data = Vec::new();
        let mut recv_data = Vec::new();

        {
            let hello = MessageMut::create_message(MessageType::Hello, &mut send_data)?;
            if let MessageMut::Hello(hello) = hello {
                hello.version_major = PROTOCOL_VERSION_MAJOR;
                hello.version_minor = PROTOCOL_VERSION_MINOR;
            }

            sender.send_binary(&send_data).await?;
        }

        let sender = Arc::new(Mutex::new(sender));
        let mut update_receiver = ctx.bitmap.read().await.subscribe();

        let mut recv_task: JoinHandle<PResult<()>> = {
            let ctx = ctx.clone();
            let sender = sender.clone();
            tokio::spawn(async move {
                let mut send_data = Vec::new();

                loop {
                    let data_type = receiver.receive_data(&mut recv_data).await?;

                    BitmapServer::client_task_receive(&ctx, data_type, &recv_data, &mut send_data)
                        .await?;

                    if !send_data.is_empty() {
                        sender.lock().await.send_binary(&send_data).await?;
                    }

                    recv_data.clear();
                }
            })
        };

        loop {
            tokio::select! {
                _ = &mut recv_task => {}
                msg = update_receiver.recv() => {
                    if let Ok(msg) = msg {
                        let psu = MessageMut::create_message(MessageType::PartialStateUpdate, &mut send_data)?;
                        if let MessageMut::PartialStateUpdate(psu) = psu {
                            psu.offset = msg.byte_array_offset;
                            psu.chunk = msg.chunk_data;
                        }

                        sender.lock().await.send_binary(&send_data).await?;
                    }
                }
            }
        }

        // sender.close().await?;
        // Ok(())
    }

    async fn client_task_receive(
        ctx: &Arc<SharedServerContext>,
        data_type: Data,
        recv_data: &Vec<u8>,
        send_data: &mut Vec<u8>,
    ) -> PResult<()> {
        if !data_type.is_binary() {
            return Ok(());
        }

        let message = Message::from_slice(&recv_data)?;
        if !message.id().is_client_message() {
            return Ok(());
        }

        send_data.clear();

        match message {
            Message::StatsRequest => {
                log::info!("Received stats request");
                let stats = MessageMut::create_message(MessageType::StatsResponse, send_data)?;
                if let MessageMut::StatsResponse(stats) = stats {
                    stats.current_clients =
                        ctx.client_count.load(std::sync::atomic::Ordering::Relaxed);
                }
            }
            Message::FullStateRequest => {
                log::info!("Received full state request");
                let full_state =
                    MessageMut::create_message(MessageType::FullStateResponse, send_data)?;
                if let MessageMut::FullStateResponse(full_state) = full_state {
                    let bitmap = ctx.bitmap.read().await;
                    full_state.bit_count = bitmap.len() as _;
                    full_state.bitmap.copy_from_slice(bitmap.as_raw_slice());
                }
            }
            Message::ToggleBit(msg) => {
                let idx = msg.index as usize;
                log::info!("Received toggle bit: {}", idx);
                ctx.bitmap.write().await.toggle(idx);
            }
            _ => (),
        }

        Ok(())
    }

    fn get_ip(
        peer_addr: Option<&SocketAddr>,
        headers: Option<&[httparse::Header<'_>]>,
    ) -> Option<IpAddr> {
        if let Some(headers) = headers {
            for header in headers {
                let value = if let Ok(value) = std::str::from_utf8(header.value) {
                    value
                } else {
                    continue;
                };

                if let Some(ip) = Self::try_parse_header(header.name, value) {
                    return Some(ip);
                }
            }
        }

        peer_addr.map(|addr| addr.ip())
    }

    fn try_parse_header(name: &str, value: &str) -> Option<IpAddr> {
        if name.eq_ignore_ascii_case("CF-Connecting-IP") {
            IpAddr::from_str(value.trim()).ok()
        } else if name.eq_ignore_ascii_case("X-Forwarded-For") {
            let ip = value.split(',').next()?;
            let ip = IpAddr::from_str(ip.trim()).ok()?;

            Some(ip)
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum BitmapError {
    InvalidHttp,
}

impl std::fmt::Display for BitmapError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            BitmapError::InvalidHttp => write!(f, "Invalid HTTP request"),
        }
    }
}

impl std::error::Error for BitmapError {}
