"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import {
  BoxCubeIcon,
  ChevronDownIcon,
  GridIcon,
  ListIcon,
  PieChartIcon,
  PlugInIcon,
} from "../icons/index";

type SubNavItem = { name: string; path: string; permission?: string };

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  permission?: string;
  subItems?: SubNavItem[];
};

const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Dashboard",
    path: "/",
  },
  {
    icon: <ListIcon />,
    name: "Tasks",
    path: "/tasks",
    permission: "task.view",
  },
  {
    name: "Products",
    icon: <BoxCubeIcon />,
    permission: "product.view",
    subItems: [
      { name: "Products", path: "/products", permission: "product.view" },
      { name: "Warehouses", path: "/warehouses", permission: "warehouse.view" },
      { name: "Inventory Dashboard", path: "/inventory/dashboard", permission: "product.view" },
      { name: "Inventory Movements", path: "/inventory/movements", permission: "inventory.adjust" },
      { name: "Stock Adjustments", path: "/inventory/stock-adjustments", permission: "inventory.adjust" },
      { name: "Cycle Counts", path: "/inventory/counts", permission: "inventory.adjust" },
    ],
  },
  {
    name: "Partners",
    icon: <BoxCubeIcon />,
    permission: "partner.view",
    subItems: [
      { name: "Business Partners", path: "/business-partners", permission: "partner.view" },
      { name: "Employees", path: "/settings/employees", permission: "partner.view" },
    ],
  },
  {
    name: "Accounting",
    icon: <BoxCubeIcon />,
    permission: "account.view",
    subItems: [
      { name: "Chart of Accounts", path: "/accounting/chart-of-accounts", permission: "account.view" },
      { name: "Cost Centers", path: "/accounting/cost-centers", permission: "costCenter.view" },
      { name: "Entries", path: "/accounting/entries", permission: "entry.view" },
    ],
  },
  {
    name: "Invoice",
    icon: <ListIcon />,
    permission: "invoice.view",
    subItems: [
      { name: "Purchase Orders", path: "/purchase-orders", permission: "purchaseOrder.view" },
      { name: "Sales", path: "/invoice/sales", permission: "invoice.view" },
      { name: "Purchase", path: "/invoice/purchase", permission: "invoice.view" },
      { name: "Credit Note", path: "/invoice/credit-note", permission: "invoice.view" },
      { name: "Debit Note", path: "/invoice/debit-note", permission: "invoice.view" },
    ],
  },
  {
    name: "Report",
    icon: <PieChartIcon />,
    permission: "report.view",
    subItems: [
      { name: "Ledger", path: "/report/ledger", permission: "report.view" },
      { name: "Trial Balance", path: "/report/trial-balance", permission: "report.view" },
      { name: "Income Statement", path: "/report/income-statement", permission: "report.view" },
      { name: "Balance Sheet", path: "/report/balance-sheet", permission: "report.view" },
      { name: "Aging & Analysis", path: "/report/aging", permission: "report.view" },
      { name: "Inventory Valuation", path: "/report/inventory-valuation", permission: "report.view" },
      { name: "Tax Summary", path: "/report/tax-summary", permission: "report.view" },
    ],
  },
  {
    icon: <PieChartIcon />,
    name: "Audit",
    permission: "audit.view",
    subItems: [
      { name: "Audit Log", path: "/audit", permission: "audit.view" },
    ],
  },
  {
    icon: <PlugInIcon />,
    name: "Settings",
    permission: "settings.manage",
    subItems: [
      { name: "Posting Profiles", path: "/settings/posting-profiles", permission: "settings.manage" },
      { name: "Tax Setup", path: "/settings/tax-setup", permission: "settings.manage" },
      { name: "Entry Categories", path: "/settings/entry-categories", permission: "settings.manage" },
      { name: "Document Sequences", path: "/settings/document-sequences", permission: "settings.manage" },
      { name: "Product Profiles", path: "/settings/product-profiles", permission: "settings.manage" },
      { name: "System Settings", path: "/settings", permission: "settings.manage" },
      { name: "Backup & Restore", path: "/settings/backup-restore", permission: "settings.manage" },
      { name: "User Management", path: "/users", permission: "user.view" },
      { name: "My Profile", path: "/profile" },
    ],
  },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const [userPermissions, setUserPermissions] = useState<string[]>([]);

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback((path: string) => path === pathname, [pathname]);

  useEffect(() => {
    async function loadPermissions() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.user?.permissions) {
            setUserPermissions(data.user.permissions);
          }
        }
      } catch {
        // ignore
      }
    }
    loadPermissions();
  }, []);

  const hasPermission = (key?: string) => !key || userPermissions.includes(key);

  const filteredNavItems = navItems
    .map((nav) => ({
      ...nav,
      subItems: nav.subItems?.filter((sub) => hasPermission(sub.permission)),
    }))
    .filter((nav) => hasPermission(nav.permission) && (!nav.subItems || nav.subItems.length > 0));

  useEffect(() => {
    let matched = false;
    navItems.forEach((nav, index) => {
      if (nav.subItems) {
        nav.subItems.forEach((subItem) => {
          if (isActive(subItem.path)) {
            setOpenIndex(index);
            matched = true;
          }
        });
      }
    });
    if (!matched) setOpenIndex(null);
  }, [pathname, isActive]);

  useEffect(() => {
    if (openIndex !== null) {
      const key = `nav-${openIndex}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prev) => ({
          ...prev,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openIndex]);

  const handleToggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex  ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link href="/">
          {isExpanded || isHovered || isMobileOpen ? (
            <span className="text-xl font-bold text-gray-900 dark:text-white">Nexus</span>
          ) : (
            <span className="text-lg font-bold text-gray-900 dark:text-white">N</span>
          )}
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <ul className="flex flex-col gap-4">
            {filteredNavItems.map((nav, index) => (
              <li key={nav.name}>
                {nav.subItems ? (
                  <button
                    onClick={() => handleToggle(index)}
                    className={`menu-item group  ${
                      openIndex === index
                        ? "menu-item-active"
                        : "menu-item-inactive"
                    } cursor-pointer ${
                      !isExpanded && !isHovered
                        ? "lg:justify-center"
                        : "lg:justify-start"
                    }`}
                  >
                    <span
                      className={` ${
                        openIndex === index
                          ? "menu-item-icon-active"
                          : "menu-item-icon-inactive"
                      }`}
                    >
                      {nav.icon}
                    </span>
                    {(isExpanded || isHovered || isMobileOpen) && (
                      <span className="menu-item-text">{nav.name}</span>
                    )}
                    {(isExpanded || isHovered || isMobileOpen) && (
                      <ChevronDownIcon
                        className={`ml-auto w-5 h-5 transition-transform duration-200  ${
                          openIndex === index
                            ? "rotate-180 text-brand-500"
                            : ""
                        }`}
                      />
                    )}
                  </button>
                ) : (
                  nav.path && (
                    <Link
                      href={nav.path}
                      className={`menu-item group ${
                        isActive(nav.path)
                          ? "menu-item-active"
                          : "menu-item-inactive"
                      }`}
                    >
                      <span
                        className={`${
                          isActive(nav.path)
                            ? "menu-item-icon-active"
                            : "menu-item-icon-inactive"
                        }`}
                      >
                        {nav.icon}
                      </span>
                      {(isExpanded || isHovered || isMobileOpen) && (
                        <span className="menu-item-text">{nav.name}</span>
                      )}
                    </Link>
                  )
                )}
                {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
                  <div
                    ref={(el) => {
                      subMenuRefs.current[`nav-${index}`] = el;
                    }}
                    className="overflow-hidden transition-all duration-300"
                    style={{
                      height:
                        openIndex === index
                          ? `${subMenuHeight[`nav-${index}`]}px`
                          : "0px",
                    }}
                  >
                    <ul className="mt-2 space-y-1 ml-9">
                      {nav.subItems.map((subItem) => (
                        <li key={subItem.name}>
                          <Link
                            href={subItem.path}
                            className={`menu-dropdown-item ${
                              isActive(subItem.path)
                                ? "menu-dropdown-item-active"
                                : "menu-dropdown-item-inactive"
                            }`}
                          >
                            {subItem.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </nav>

      </div>
    </aside>
  );
};

export default AppSidebar;
