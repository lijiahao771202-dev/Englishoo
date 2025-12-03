/**
 * @description 音效工具库 - 使用 Web Audio API 生成音效，无需外部资源
 */

let audioCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioCtx) {
    // 兼容 Safari
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  // 如果 context 被暂停（浏览器自动播放策略），尝试恢复
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

/**
 * 播放清脆的点击音效 (高频短促的正弦波)
 */
export const playClickSound = () => {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // 设置音色
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, ctx.currentTime); // 800Hz
    oscillator.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05); // 快速滑音

    // 设置音量包络 (极短的 Attack 和 Decay)
    gainNode.gain.setValueAtTime(0.05, ctx.currentTime); // 初始音量 (避免爆音)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.05);
  } catch (e) {
    console.error('Audio playback failed:', e);
  }
};

/**
 * 播放强烈的成功正反馈音效 (C大调琶音 + 铃声效果)
 * C5 (523.25), E5 (659.25), G5 (783.99), C6 (1046.50)
 */
export const playSuccessSound = () => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // 定义和弦频率 (C Major 7)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    
    notes.forEach((freq, index) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // 使用正弦波模拟铃声/清脆感，或者 triangle 增加一点厚度
      oscillator.type = index === 3 ? 'sine' : 'triangle'; 
      oscillator.frequency.setValueAtTime(freq, now);

      // 琶音效果：每个音符稍微延迟一点
      const startTime = now + (index * 0.04); 
      const duration = 0.8;

      // 音量包络 (ADSR)
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.02); // Attack (Increased volume)
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration); // Decay

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    });

    // 增加一个额外的 "闪烁" 高音 (E6) 增强愉悦感
    const sparkleOsc = ctx.createOscillator();
    const sparkleGain = ctx.createGain();
    sparkleOsc.connect(sparkleGain);
    sparkleGain.connect(ctx.destination);
    
    sparkleOsc.type = 'sine';
    sparkleOsc.frequency.setValueAtTime(1318.51, now + 0.15); // E6
    
    sparkleGain.gain.setValueAtTime(0, now + 0.15);
    sparkleGain.gain.linearRampToValueAtTime(0.15, now + 0.17); // Increased volume
    sparkleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    
    sparkleOsc.start(now + 0.15);
    sparkleOsc.stop(now + 0.6);

  } catch (e) {
    console.error('Success sound failed:', e);
  }
};

/**
 * 播放拼写测试通过音效 (更加柔和悦耳的音效)
 * 使用 FM 合成或柔和的钟声效果
 */
export const playSpellingSuccessSound = () => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
  
      // 主音：柔和的钟声 (Sine + Triangle 混合)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
  
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now); // A5
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.15, now + 0.05); // Increased volume
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      
      osc1.start(now);
      osc1.stop(now + 1.5);
  
      // 泛音：增加空灵感
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
  
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1760, now); // A6
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.linearRampToValueAtTime(0.08, now + 0.05); // Increased volume
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
  
      osc2.start(now);
      osc2.stop(now + 1.0);
  
    } catch (e) {
      console.error('Spelling success sound failed:', e);
    }
  };
  
  /**
   * 播放失败/未通过音效 (低沉、柔和的提示音，避免过于刺耳)
   */
  export const playFailSound = () => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
  
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
  
      osc.connect(gain);
      gain.connect(ctx.destination);
  
      osc.type = 'triangle'; // 柔和一点的波形
      osc.frequency.setValueAtTime(150, now); // 低频
      osc.frequency.linearRampToValueAtTime(100, now + 0.4); // 音高下降
  
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  
      osc.start(now);
      osc.stop(now + 0.4);
    } catch (e) {
      console.error('Fail sound failed:', e);
    }
  };

  /**
   * 播放通过/记住了音效 (简单积极的确认音)
   */
  export const playPassSound = () => {
      try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
    
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
    
        osc.connect(gain);
        gain.connect(ctx.destination);
    
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.15); // 上升音调
    
        // 增强音量和持续时间
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    
        osc.start(now);
        osc.stop(now + 0.25);
      } catch (e) {
        console.error('Pass sound failed:', e);
      }
    };
