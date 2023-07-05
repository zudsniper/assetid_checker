export interface SteamItem {
    id: string;
    classid: string;
    instanceid: string;
    amount: string;
    hide_in_china: number;
    pos: number;
}

export interface SteamInventory {
    success: boolean;
    rgInventory: {
        [key: string]: SteamItem;
    }
}

export function processInventoryItems(inventory: SteamInventory, callback: (item: SteamItem) => void): void {
    Object.values(inventory.rgInventory).forEach(callback);
}
