use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicUsize, Ordering};

pub struct NativeAudioPlayer {
    pub latest_request: Arc<AtomicUsize>,
}

fn main() {
    let player = NativeAudioPlayer {
        latest_request: Arc::new(AtomicUsize::new(0)),
    };
    
    let id = player.latest_request.fetch_add(1, Ordering::SeqCst) + 1;
    let token = Arc::clone(&player.latest_request);
    
    println!("id: {}, token: {}", id, token.load(Ordering::SeqCst));
    if token.load(Ordering::SeqCst) != id {
        println!("Mismatch!");
    } else {
        println!("Match!");
    }
}
