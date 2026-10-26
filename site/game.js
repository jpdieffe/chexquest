export const KEYS={Escape:256,Enter:257,Tab:258,Backspace:259,ArrowRight:262,ArrowLeft:263,ArrowDown:264,ArrowUp:265,F1:290,F2:291,F3:292,F4:293,F5:294,F6:295,F7:296,F8:297,F9:298,F10:299,F11:300,F12:301,ShiftLeft:340,ShiftRight:344,ControlLeft:341,ControlRight:345,AltLeft:342,Space:69,KeyF:341};
export class Game{
  constructor(canvas,events={}){this.canvas=canvas;this.events=events;this.context=canvas.getContext('2d',{alpha:false});this.frames=0;this.nodes=new Set();this.held=new Map();this.muted=false;this.logs=[];}
  async enableAudio(){this.audio??=new AudioContext();await this.audio.resume();}
  async start({host=false,net=null,level=1,skill=2,nomonsters=false}={}){
    await this.enableAudio();
    const response=await fetch('game/chexquest.zip');if(!response.ok)throw new Error('The original Chex Quest files could not load. Reload and try again.');
    const network=net?(host?'ipxnet startserver':'ipxnet connect 1'):'',driver=net?`ipxsetup -nodes 2 -player ${host?1:2} -dup 1 chex.exe`:'chex.exe';
    const command=`${driver} ${net?'-file COOP.WAD ':''}-warp 1 ${level} -skill ${skill}${nomonsters?' -nomonsters':''}`;
    const dosboxConf=`[sdl]\nfullscreen=false\n[dosbox]\nmachine=svga_s3\nmemsize=16\n[cpu]\ncore=auto\ncycles=fixed 18000\n[mixer]\nrate=22050\nblocksize=1024\nprebuffer=30\n[sblaster]\nsbtype=sb16\n[autoexec]\n@echo off\nmount c .\nc:\n${network}\n${command}\n`;
    emulators.pathPrefix=new URL('vendor/',location.href).href;
    this.ci=await emulators.dosboxWorker([new Uint8Array(await response.arrayBuffer()),{dosboxConf,jsdosConf:{version:'8'}}],{net});
    this.ci.events().onFrameSize((width,height)=>{this.canvas.width=width;this.canvas.height=height;this.frame=this.context.createImageData(width,height);});
    this.ci.events().onFrame((rgb,rgba)=>{
      if(!this.frame||this.frame.width!==this.ci.width()||this.frame.height!==this.ci.height()){
        this.canvas.width=this.ci.width();this.canvas.height=this.ci.height();this.frame=this.context.createImageData(this.canvas.width,this.canvas.height);
      }
      if(rgba)this.frame.data.set(rgba);else if(rgb)for(let i=0,j=0;i<rgb.length;i+=3,j+=4){this.frame.data[j]=rgb[i];this.frame.data[j+1]=rgb[i+1];this.frame.data[j+2]=rgb[i+2];this.frame.data[j+3]=255;}else return;
      this.context.putImageData(this.frame,0,0);this.frames++;
      if(!this.playing&&this.canvas.width===320&&this.canvas.height===200){
        // The game switches video modes before loading the level. Wait for the
        // actual status bar rather than declaring the initial black frame ready.
        let blue=0;for(let y=172;y<197;y++)for(let x=0;x<80;x++){const i=(y*320+x)*4,d=this.frame.data;if(d[i]<60&&d[i+1]<70&&d[i+2]>90)blue++;}
        if(blue>250){this.playing=true;this.events.playing?.();}
      }
    });
    this.ci.events().onSoundPush(samples=>this.sound(samples));
    this.ci.events().onNetworkConnected(()=>this.events.networkReady?.());
    this.ci.events().onMessage((type,...args)=>{const text=args.join(' ');this.logs.push(text);if(this.logs.length>150)this.logs.shift();if(type==='panic')this.events.error?.(text);});
    this.ci.events().onStdout(text=>{this.logs.push(text);if(this.logs.length>150)this.logs.shift();});
    this.ci.events().onExit(()=>this.events.exit?.());
    return this.ci;
  }
  sound(samples){
    if(this.audio.state!=='running')return;
    const buffer=this.audio.createBuffer(2,samples.length/2,this.ci.soundFrequency());
    for(let c=0;c<2;c++){const channel=buffer.getChannelData(c);for(let i=0;i<channel.length;i++)channel[i]=samples[i*2+c];}
    const now=this.audio.currentTime;if(!this.nextAudio||this.nextAudio<now||this.nextAudio>now+.25)this.nextAudio=now+.02;
    const node=this.audio.createBufferSource();node.buffer=buffer;if(!this.muted)node.connect(this.audio.destination);this.nodes.add(node);
    node.onended=()=>{node.disconnect();this.nodes.delete(node);};node.start(this.nextAudio);this.nextAudio+=buffer.duration;
  }
  key(source,code,down){
    const before=new Set(this.held.values());if(down)this.held.set(source,code);else this.held.delete(source);const after=new Set(this.held.values());
    for(const key of before)if(!after.has(key))this.ci?.sendKeyEvent(key,false);
    for(const key of after)if(!before.has(key))this.ci?.sendKeyEvent(key,true);
  }
  release(){for(const code of new Set(this.held.values()))this.ci?.sendKeyEvent(code,false);this.held.clear();this.ci?.sendMouseButton(0,false);}
  async close(){this.release();await this.ci?.exit();for(const node of this.nodes)node.stop();await this.audio?.close();}
}
