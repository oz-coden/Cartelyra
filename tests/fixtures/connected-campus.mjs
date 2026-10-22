// Synthetic geometry exercises mixed floor labels without asserting real campus connections.
export function connectedCampus() {
  const rectangle = (x,y,w,h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  const edge = (from,to,extra={}) => ({from,to,type:'walk',isIndoor:true,isAccessible:true,verification:'verified',routingCost:2,cover:'indoor',...extra});
  const buildings=[],floors=[];
  const specifications=[['a','A棟',[2,3]],['b','B棟',[1,2]],['c','C棟',[-1,1]]];
  specifications.forEach(([id,name,levels],i)=>{
    const floorIds=['lower','upper'];
    buildings.push({id,name,code:id,color:'#3266a8',origin:[i*28,0,0],rotation:0,floorIds,connections:[
      edge(`${id}/lower/stair`,`${id}/upper/stair`,{type:'stairs',isAccessible:false})
    ]});
    levels.forEach((level,j)=>floors.push({buildingId:id,id:floorIds[j],level,label:level===-1?'B1':`${level}F`,stackIndex:j,elevation:j*8,
      sourceId:'fixture',notes:[],outline:rectangle(0,0,20,20),voids:[],
      features:[{id:'stair',label:'階段',type:'stairs',polygon:rectangle(14,14,2,2),entrance:'stair'}],
      rooms:[{id:`${id}-${j}`,name:`${id}-${j} 部屋`,aliases:[],category:'lecture',polygon:rectangle(2,2,4,4),entrance:'room'}],
      navigation:{nodes:[
        {id:'room',name:`${id}-${j} 部屋`,type:'room_entrance',position:[6,4]},
        {id:'hall',name:'通路',type:'corridor',position:[10,4]},
        {id:'junction',name:'分岐',type:'corridor',position:[10,10]},
        {id:'left',name:'連絡通路西側',type:'corridor',position:[0,10]},
        {id:'right',name:'連絡通路東側',type:'corridor',position:[20,10]},
        {id:'stair',name:'階段乗り場',type:'stairs',position:[15,14]},
      ],edges:[edge('room','hall'),edge('hall','junction'),edge('junction','left'),edge('junction','right'),edge('junction','stair')]}
    }));
  });
  const manifest={schemaVersion:1,campusName:'Test',coordinateUnit:'schematic',buildingIds:['a','b','c'],connections:[],viewGroups:[{
    id:'connected',name:'A・B・C棟',status:'ready',verification:'inferred',buildingIds:['a','b','c'],notes:['参考図'],
    levels:['lower','upper'].map((id,i)=>({id,label:`共通レベル${i+1}`,floors:['a','b','c'].map(buildingId=>({buildingId,floorId:id}))})),
  }]};
  for(const id of ['lower','upper']) manifest.connections.push(
    edge(`a/${id}/right`,`b/${id}/left`,{type:'bridge',cover:'covered',isIndoor:false,floorChanges:0}),
    edge(`b/${id}/right`,`c/${id}/left`,{type:'bridge',floorChanges:0}),
  );
  const overview={sourceId:'fixture',buildings:buildings.map(b=>({id:b.id,name:b.name,polygon:rectangle(b.origin[0],0,20,20)})),gates:[]};
  return {manifest,buildings,floors,overview,sources:[{id:'fixture',filename:'synthetic',description:'Synthetic connected buildings'}]};
}
