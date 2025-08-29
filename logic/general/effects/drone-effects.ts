export const initDroneEffects = (bonusSystem) => {
    bonusSystem.registerEffect('drone_collection_speed', {
        name: 'Drone Collection Speed',
        description: 'Multiplier for drone resource collection speed',
        initialValue: 1,
    })
    
    bonusSystem.registerEffect('drone_max_battery', {
        name: 'Drone Max Battery',
        description: 'Multiplier for drone maximum battery capacity',
        initialValue: 1,
    })
    
    bonusSystem.registerEffect('drone_inventory_capacity', {
        name: 'Drone Inventory Capacity',
        description: 'Multiplier for drone maximum resource inventory capacity',
        initialValue: 1,
    })

    bonusSystem.registerEffect('drone_movement_speed', {
        name: 'Drone Movement Speed',
        description: 'Multiplier for drone movement speed',
        initialValue: 1,
    })
}